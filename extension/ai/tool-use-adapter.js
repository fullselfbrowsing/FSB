/**
 * Provider Format Adapter for FSB Tool Use
 *
 * Verified Phase 183: formatToolsForProvider, parseToolCalls, isToolCallResponse correct for all 4 provider families
 *
 * Translates between canonical tool definitions (from tool-definitions.js)
 * and the native tool_use message format for each AI provider.
 *
 * Per D-07/D-09/D-10: Separate from UniversalProvider, exports 5 core
 * functions + 1 helper, with three adapter implementations:
 *   - OpenAI/xAI/OpenRouter/Custom (shared default)
 *   - Anthropic
 *   - Gemini
 *
 * Provider key mapping (per D-14/D-17):
 *   'xai', 'openai', 'openrouter', 'custom' -> OpenAI format (default)
 *   'anthropic' -> Anthropic format
 *   'gemini' -> Gemini format
 *
 * @module tool-use-adapter
 */

'use strict';

// =========================================================================
// formatToolsForProvider(tools, provider)
// =========================================================================

/**
 * Format an array of canonical tool definitions into the native format
 * expected by the given provider's API.
 *
 * @param {Array<Object>} tools - Array of tool definition objects from TOOL_REGISTRY
 * @param {string} provider - Provider key: 'xai'|'openai'|'anthropic'|'gemini'|'openrouter'|'custom'
 * @returns {Array<Object>} Provider-formatted tool definitions
 */
function formatToolsForProvider(tools, provider) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return [];
  }

  // Helper: clean inputSchema by stripping empty required arrays (xAI/OpenAI reject them)
  function cleanSchema(schema) {
    if (!schema) return { type: 'object', properties: {} };
    const cleaned = { ...schema };
    if (Array.isArray(cleaned.required) && cleaned.required.length === 0) {
      delete cleaned.required;
    }
    return cleaned;
  }

  switch (provider) {
    case 'anthropic':
      // Anthropic: { name, description, input_schema }
      return tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: cleanSchema(t.inputSchema)
      }));

    case 'gemini':
      // Gemini: [{ functionDeclarations: [{ name, description, parameters }] }]
      return [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: cleanSchema(t.inputSchema)
        }))
      }];

    default:
      // OpenAI/xAI/OpenRouter/Custom: { type: 'function', function: { name, description, parameters } }
      return tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: cleanSchema(t.inputSchema)
        }
      }));
  }
}

// =========================================================================
// parseToolCalls(response, provider)
// =========================================================================

/**
 * Extract normalized tool calls from a raw API response.
 * Returns array of { id, name, args } where args is always a parsed object.
 *
 * PITFALL 1 (from research): OpenAI returns arguments as a JSON STRING
 * that must be JSON.parsed. Anthropic and Gemini return already-parsed objects.
 *
 * @param {Object} response - Raw API response object
 * @param {string} provider - Provider key
 * @returns {Array<{id: string, name: string, args: Object}>} Normalized tool calls
 */
function parseToolCalls(response, provider) {
  if (!response) {
    return [];
  }

  switch (provider) {
    case 'anthropic': {
      // Location: response.content[] where type === 'tool_use'
      // ID: block.id, Name: block.name, Args: block.input (already parsed object)
      const blocks = (response.content || []).filter(b => b.type === 'tool_use');
      return blocks.map(b => ({
        id: b.id,
        name: b.name,
        args: b.input || {}  // Already an object -- do NOT JSON.parse
      }));
    }

    case 'gemini': {
      // Location: response.candidates[0].content.parts[] where functionCall exists
      // ID: part.functionCall.id or fallback (Gemini may not provide id)
      // Name: part.functionCall.name, Args: part.functionCall.args (already parsed)
      const parts = response.candidates?.[0]?.content?.parts || [];
      return parts.filter(p => p.functionCall).map((p, i) => ({
        id: p.functionCall.id || `gemini-call-${i}`,
        name: p.functionCall.name,
        args: p.functionCall.args || {}  // Already an object
      }));
    }

    default: {
      // OpenAI/xAI/OpenRouter/Custom
      // Location: response.choices[0].message.tool_calls
      // PITFALL: arguments is a JSON STRING, must JSON.parse it
      const calls = response.choices?.[0]?.message?.tool_calls || [];
      return calls.map(c => {
        let args = c.function.arguments || {};
        let argsParseError = null;
        if (typeof c.function.arguments === 'string') {
          try {
            args = JSON.parse(c.function.arguments);
          } catch (err) {
            // Truncated/malformed arguments (e.g. finish_reason 'length'). The
            // assistant message carrying this tool_call is already in history,
            // so the call must stay in the returned array -- an unpaired
            // tool_call is a guaranteed provider 400 on the next request.
            args = {};
            argsParseError = (err && err.message ? err.message : 'invalid JSON')
              + '; raw length ' + c.function.arguments.length;
            console.warn('[ToolUseAdapter] Failed to parse tool call arguments; substituting {}', {
              id: c.id, name: c.function.name, error: argsParseError
            });
          }
        }
        const call = { id: c.id, name: c.function.name, args };
        if (argsParseError) call.argsParseError = argsParseError;
        return call;
      });
    }
  }
}

// =========================================================================
// formatToolResult(id, result, provider, options)
// =========================================================================

/**
 * Format a tool execution result for appending to conversation history.
 *
 * PITFALL 3 (from research): Anthropic and Gemini use role:'user' for tool
 * results, NOT role:'tool'. Only OpenAI uses role:'tool'.
 *
 * @param {string} id - Tool call ID from parseToolCalls
 * @param {*} result - Execution result (object or string)
 * @param {string} provider - Provider key
 * @param {Object} [options] - Optional: { name: string, isError: boolean }
 * @returns {Object} Provider-formatted tool result message
 */
function formatToolResult(id, result, provider, options) {
  switch (provider) {
    case 'anthropic':
      // Role: "user" (NOT "tool") with tool_result content block
      return {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
          ...(options?.isError ? { is_error: true } : {})
        }]
      };

    case 'gemini':
      // Role: "user" with functionResponse part
      return {
        role: 'user',
        parts: [{
          functionResponse: {
            name: options?.name || '',
            response: typeof result === 'object' && result !== null ? result : { result }
          }
        }]
      };

    default:
      // OpenAI/xAI/OpenRouter/Custom: role "tool" with tool_call_id
      return {
        role: 'tool',
        tool_call_id: id,
        name: options?.name || '',
        content: typeof result === 'string' ? result : JSON.stringify(result)
      };
  }
}

// =========================================================================
// isToolCallResponse(response, provider)
// =========================================================================

/**
 * Determine whether a provider response contains tool calls.
 *
 * PITFALL 2 (from research): Gemini does NOT signal tool calls via
 * finishReason. Must inspect response parts for functionCall presence.
 *
 * @param {Object} response - Raw API response object
 * @param {string} provider - Provider key
 * @returns {boolean} True if the response contains tool calls
 */
function isToolCallResponse(response, provider) {
  if (!response) {
    return false;
  }

  switch (provider) {
    case 'anthropic':
      // Signal: stop_reason === 'tool_use'
      return response.stop_reason === 'tool_use';

    case 'gemini': {
      // PITFALL 2: finishReason does NOT signal tool calls.
      // Must inspect parts for functionCall presence.
      const parts = response.candidates?.[0]?.content?.parts || [];
      return parts.some(p => !!p.functionCall);
    }

    default: {
      // OpenAI/xAI/OpenRouter/Custom.
      // Primary signal: finish_reason === 'tool_calls'.
      // Fallback: also check if tool_calls exist in message body even when
      // finish_reason is "stop" (mixed text+tools) or "length" (truncated).
      // Without this fallback, tool calls are silently dropped and the agent
      // loop exits at the isToolCallResponse gate (agent-loop.js:1250).
      const finishReason = response.choices?.[0]?.finish_reason;
      if (finishReason === 'tool_calls') return true;
      const toolCalls = response.choices?.[0]?.message?.tool_calls;
      return Array.isArray(toolCalls) && toolCalls.length > 0;
    }
  }
}

// =========================================================================
// formatAssistantMessage(response, provider)
// =========================================================================

/**
 * Extract the assistant's message (including tool call blocks) for
 * conversation history preservation. This must be appended to history
 * BEFORE tool results per Pitfall 5.
 *
 * @param {Object} response - Raw API response object
 * @param {string} provider - Provider key
 * @returns {Object} Provider-formatted assistant message for history
 */
function formatAssistantMessage(response, provider) {
  switch (provider) {
    case 'anthropic':
      // The full content array (contains both text and tool_use blocks)
      return {
        role: 'assistant',
        content: response.content || []
      };

    case 'gemini':
      // Gemini uses 'model' role, not 'assistant'
      return {
        role: 'model',
        parts: response.candidates?.[0]?.content?.parts || []
      };

    default: {
      // OpenAI/xAI/OpenRouter/Custom: the full message from choices[0].message
      const msg = response.choices?.[0]?.message;
      if (!msg) {
        return { role: 'assistant', content: '' };
      }
      return { role: 'assistant', ...msg };
    }
  }
}

// =========================================================================
// extractUsage(response, provider)
// =========================================================================

/**
 * Extract token usage information from a provider response.
 * Useful for cost tracking and analytics.
 *
 * @param {Object} response - Raw API response object
 * @param {string} provider - Provider key
 * @returns {{input: number|undefined, output: number|undefined}} Token usage counts
 */
function extractUsage(response, provider) {
  if (!response) {
    return { input: undefined, output: undefined };
  }

  switch (provider) {
    case 'anthropic':
      return {
        input: response.usage?.input_tokens,
        output: response.usage?.output_tokens
      };

    case 'gemini':
      return {
        input: response.usageMetadata?.promptTokenCount,
        output: response.usageMetadata?.candidatesTokenCount
      };

    default:
      // OpenAI/xAI/OpenRouter/Custom
      return {
        input: response.usage?.prompt_tokens,
        output: response.usage?.completion_tokens
      };
  }
}

// =========================================================================
// EXPORTS
// =========================================================================

// CommonJS for Chrome extension context and Node.js require()
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatToolsForProvider,
    parseToolCalls,
    formatToolResult,
    isToolCallResponse,
    formatAssistantMessage,
    extractUsage
  };
}
