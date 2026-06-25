import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chatgpt-api.js';
import { memorySchema, mapMemory } from './schemas.js';

export const getMemories = defineTool({
  name: 'get_memories',
  displayName: 'Get Memories',
  description:
    'Get all ChatGPT memories. Memories are facts ChatGPT remembers about you across conversations. Returns the memory list and token usage.',
  summary: 'Get your ChatGPT memories',
  icon: 'brain',
  group: 'Memories',
  input: z.object({}),
  output: z.object({
    memories: z.array(memorySchema).describe('List of memories'),
    memory_max_tokens: z.number().describe('Maximum memory token budget'),
    memory_num_tokens: z.number().describe('Current memory token usage'),
  }),
  handle: async () => {
    const data = await api<{
      memories?: { id?: string; content?: string; created_at?: number; updated_at?: number }[];
      memory_max_tokens?: number;
      memory_num_tokens?: number;
    }>('/memories');
    return {
      memories: (data.memories ?? []).map(mapMemory),
      memory_max_tokens: data.memory_max_tokens ?? 0,
      memory_num_tokens: data.memory_num_tokens ?? 0,
    };
  },
});
