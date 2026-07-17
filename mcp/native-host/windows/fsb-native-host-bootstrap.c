#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <wctype.h>

#define FSB_CONFIG_CAP_BYTES 65536
#define FSB_CONFIG_HEADER_BYTES 24
#define FSB_PATH_CAP_CHARS 32767
#define FSB_ORIGIN_CHARS 52

static const unsigned char FSB_CONFIG_MAGIC[8] = "FSBNH01";
static const wchar_t FSB_CONFIG_FILENAME[] = L"fsb-native-host-bootstrap.bin";

typedef struct FsbBootstrapConfig {
  wchar_t *node_path;
  wchar_t *entry_path;
  wchar_t *origin;
} FsbBootstrapConfig;

static void fsb_error(const char *identifier) {
  DWORD written = 0;
  HANDLE error_handle = GetStdHandle(STD_ERROR_HANDLE);
  if (error_handle == NULL || error_handle == INVALID_HANDLE_VALUE) return;
  WriteFile(error_handle, identifier, (DWORD)strlen(identifier), &written, NULL);
  WriteFile(error_handle, "\n", 1, &written, NULL);
}

static uint32_t read_u32_le(const unsigned char *bytes) {
  return ((uint32_t)bytes[0])
    | ((uint32_t)bytes[1] << 8)
    | ((uint32_t)bytes[2] << 16)
    | ((uint32_t)bytes[3] << 24);
}

static int is_ascii_alpha(wchar_t value) {
  return (value >= L'A' && value <= L'Z') || (value >= L'a' && value <= L'z');
}

static int is_absolute_regular_file(const wchar_t *path) {
  DWORD attributes;
  DWORD expanded_length;
  wchar_t *expanded;
  int matches;
  size_t length = wcslen(path);

  if (length < 3 || length > FSB_PATH_CAP_CHARS) return 0;
  if (!is_ascii_alpha(path[0]) || path[1] != L':' || (path[2] != L'\\' && path[2] != L'/')) {
    return 0;
  }
  if (
    wcsncmp(path, L"\\\\?\\", 4) == 0
    || wcsncmp(path, L"\\\\.\\", 4) == 0
    || wcsncmp(path, L"\\\\", 2) == 0
  ) {
    return 0;
  }

  expanded_length = GetFullPathNameW(path, 0, NULL, NULL);
  if (expanded_length == 0 || expanded_length > FSB_PATH_CAP_CHARS) return 0;
  expanded = (wchar_t *)calloc((size_t)expanded_length + 1, sizeof(wchar_t));
  if (expanded == NULL) return 0;
  if (GetFullPathNameW(path, expanded_length + 1, expanded, NULL) == 0) {
    free(expanded);
    return 0;
  }
  matches = _wcsicmp(path, expanded) == 0;
  free(expanded);
  if (!matches) return 0;

  attributes = GetFileAttributesW(path);
  if (attributes == INVALID_FILE_ATTRIBUTES) return 0;
  if ((attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) return 0;
  if ((attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) return 0;
  return 1;
}

static int validate_origin(const wchar_t *origin) {
  static const wchar_t prefix[] = L"chrome-extension://";
  size_t index;
  if (wcslen(origin) != FSB_ORIGIN_CHARS) return 0;
  if (wcsncmp(origin, prefix, 19) != 0) return 0;
  for (index = 19; index < 51; index += 1) {
    if (origin[index] < L'a' || origin[index] > L'p') return 0;
  }
  return origin[51] == L'/';
}

static int validate_parent_window(const wchar_t *argument) {
  static const wchar_t prefix[] = L"--parent-window=";
  size_t index;
  size_t length = wcslen(argument);
  if (length < 17 || length > 36 || wcsncmp(argument, prefix, 16) != 0) return 0;
  for (index = 16; index < length; index += 1) {
    if (!iswdigit(argument[index])) return 0;
  }
  return 1;
}

static wchar_t *decode_utf8(const unsigned char *bytes, uint32_t length) {
  int characters;
  wchar_t *value;
  if (length == 0 || memchr(bytes, '\0', length) != NULL) return NULL;
  characters = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, (LPCCH)bytes, (int)length, NULL, 0);
  if (characters <= 0 || characters > FSB_PATH_CAP_CHARS) return NULL;
  value = (wchar_t *)calloc((size_t)characters + 1, sizeof(wchar_t));
  if (value == NULL) return NULL;
  if (MultiByteToWideChar(
    CP_UTF8,
    MB_ERR_INVALID_CHARS,
    (LPCCH)bytes,
    (int)length,
    value,
    characters
  ) != characters) {
    free(value);
    return NULL;
  }
  value[characters] = L'\0';
  return value;
}

static void free_config(FsbBootstrapConfig *config) {
  if (config == NULL) return;
  free(config->node_path);
  free(config->entry_path);
  free(config->origin);
  config->node_path = NULL;
  config->entry_path = NULL;
  config->origin = NULL;
}

static int sibling_config_path(wchar_t *output, DWORD output_chars) {
  DWORD length = GetModuleFileNameW(NULL, output, output_chars);
  wchar_t *separator;
  size_t directory_chars;
  size_t filename_chars = wcslen(FSB_CONFIG_FILENAME);
  if (length == 0 || length >= output_chars) return 0;
  separator = wcsrchr(output, L'\\');
  if (separator == NULL) separator = wcsrchr(output, L'/');
  if (separator == NULL) return 0;
  directory_chars = (size_t)(separator - output) + 1;
  if (directory_chars + filename_chars + 1 > output_chars) return 0;
  memcpy(output + directory_chars, FSB_CONFIG_FILENAME, (filename_chars + 1) * sizeof(wchar_t));
  return 1;
}

static int read_config(FsbBootstrapConfig *config) {
  wchar_t config_path[FSB_PATH_CAP_CHARS + 1];
  HANDLE file = INVALID_HANDLE_VALUE;
  LARGE_INTEGER size;
  unsigned char *bytes = NULL;
  DWORD read = 0;
  uint32_t schema;
  uint32_t node_length;
  uint32_t entry_length;
  uint32_t origin_length;
  uint64_t expected_size;
  DWORD attributes;
  int ok = 0;

  if (!sibling_config_path(config_path, FSB_PATH_CAP_CHARS + 1)) goto cleanup;
  attributes = GetFileAttributesW(config_path);
  if (
    attributes == INVALID_FILE_ATTRIBUTES
    || (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0
    || (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0
  ) {
    goto cleanup;
  }
  file = CreateFileW(
    config_path,
    GENERIC_READ,
    FILE_SHARE_READ,
    NULL,
    OPEN_EXISTING,
    FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT,
    NULL
  );
  if (file == INVALID_HANDLE_VALUE) goto cleanup;
  if (!GetFileSizeEx(file, &size)) goto cleanup;
  if (size.QuadPart < FSB_CONFIG_HEADER_BYTES || size.QuadPart > FSB_CONFIG_CAP_BYTES) goto cleanup;
  bytes = (unsigned char *)malloc((size_t)size.QuadPart);
  if (bytes == NULL) goto cleanup;
  if (!ReadFile(file, bytes, (DWORD)size.QuadPart, &read, NULL) || read != (DWORD)size.QuadPart) {
    goto cleanup;
  }
  if (memcmp(bytes, FSB_CONFIG_MAGIC, sizeof(FSB_CONFIG_MAGIC)) != 0) goto cleanup;
  schema = read_u32_le(bytes + 8);
  node_length = read_u32_le(bytes + 12);
  entry_length = read_u32_le(bytes + 16);
  origin_length = read_u32_le(bytes + 20);
  expected_size = (uint64_t)FSB_CONFIG_HEADER_BYTES
    + (uint64_t)node_length
    + (uint64_t)entry_length
    + (uint64_t)origin_length;
  if (schema != 1 || expected_size != (uint64_t)size.QuadPart) goto cleanup;
  config->node_path = decode_utf8(bytes + FSB_CONFIG_HEADER_BYTES, node_length);
  config->entry_path = decode_utf8(
    bytes + FSB_CONFIG_HEADER_BYTES + node_length,
    entry_length
  );
  config->origin = decode_utf8(
    bytes + FSB_CONFIG_HEADER_BYTES + node_length + entry_length,
    origin_length
  );
  if (config->node_path == NULL || config->entry_path == NULL || config->origin == NULL) {
    goto cleanup;
  }
  if (!is_absolute_regular_file(config->node_path) || !is_absolute_regular_file(config->entry_path)) {
    goto cleanup;
  }
  if (!validate_origin(config->origin)) goto cleanup;
  ok = 1;

cleanup:
  if (file != INVALID_HANDLE_VALUE) CloseHandle(file);
  free(bytes);
  if (!ok) free_config(config);
  return ok;
}

static int append_character(wchar_t *output, size_t capacity, size_t *length, wchar_t value) {
  if (*length + 1 >= capacity) return 0;
  output[*length] = value;
  *length += 1;
  output[*length] = L'\0';
  return 1;
}

static int append_quoted_argument(
  wchar_t *output,
  size_t capacity,
  size_t *output_length,
  const wchar_t *argument
) {
  size_t index = 0;
  if (*output_length > 0 && !append_character(output, capacity, output_length, L' ')) return 0;
  if (!append_character(output, capacity, output_length, L'"')) return 0;
  while (argument[index] != L'\0') {
    size_t slashes = 0;
    while (argument[index] == L'\\') {
      slashes += 1;
      index += 1;
    }
    if (argument[index] == L'"') {
      size_t count;
      for (count = 0; count < (slashes * 2) + 1; count += 1) {
        if (!append_character(output, capacity, output_length, L'\\')) return 0;
      }
      if (!append_character(output, capacity, output_length, L'"')) return 0;
      index += 1;
      continue;
    }
    if (argument[index] == L'\0') {
      size_t count;
      for (count = 0; count < slashes * 2; count += 1) {
        if (!append_character(output, capacity, output_length, L'\\')) return 0;
      }
      break;
    }
    while (slashes > 0) {
      if (!append_character(output, capacity, output_length, L'\\')) return 0;
      slashes -= 1;
    }
    if (!append_character(output, capacity, output_length, argument[index])) return 0;
    index += 1;
  }
  return append_character(output, capacity, output_length, L'"');
}

static wchar_t *build_command_line(
  const FsbBootstrapConfig *config,
  const wchar_t *parent_window
) {
  size_t capacity = (
    wcslen(config->node_path)
    + wcslen(config->entry_path)
    + wcslen(config->origin)
    + (parent_window == NULL ? 0 : wcslen(parent_window))
    + 32
  ) * 2;
  size_t length = 0;
  wchar_t *command_line = (wchar_t *)calloc(capacity, sizeof(wchar_t));
  if (command_line == NULL) return NULL;
  if (
    !append_quoted_argument(command_line, capacity, &length, config->node_path)
    || !append_quoted_argument(command_line, capacity, &length, config->entry_path)
    || !append_quoted_argument(command_line, capacity, &length, config->origin)
    || (
      parent_window != NULL
      && !append_quoted_argument(command_line, capacity, &length, parent_window)
    )
  ) {
    free(command_line);
    return NULL;
  }
  return command_line;
}

int wmain(int argc, wchar_t **argv) {
  FsbBootstrapConfig config = {0};
  const wchar_t *parent_window = NULL;
  wchar_t *command_line = NULL;
  STARTUPINFOW startup;
  PROCESS_INFORMATION process;
  DWORD child_exit = 1;
  BOOL created;

  if (!read_config(&config)) {
    fsb_error("FSBNH_E_CONFIG");
    return 20;
  }
  if (argc != 2 && argc != 3) {
    fsb_error("FSBNH_E_ARGS");
    free_config(&config);
    return 21;
  }
  if (wcscmp(argv[1], config.origin) != 0) {
    fsb_error("FSBNH_E_ORIGIN");
    free_config(&config);
    return 22;
  }
  if (argc == 3) {
    if (!validate_parent_window(argv[2])) {
      fsb_error("FSBNH_E_ARGS");
      free_config(&config);
      return 21;
    }
    parent_window = argv[2];
  }

  command_line = build_command_line(&config, parent_window);
  if (command_line == NULL) {
    fsb_error("FSBNH_E_MEMORY");
    free_config(&config);
    return 23;
  }

  ZeroMemory(&startup, sizeof(startup));
  ZeroMemory(&process, sizeof(process));
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);

  created = CreateProcessW(
    config.node_path,
    command_line,
    NULL,
    NULL,
    TRUE,
    CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
    NULL,
    NULL,
    &startup,
    &process
  );
  if (!created) {
    fsb_error("FSBNH_E_CREATE_PROCESS");
    free(command_line);
    free_config(&config);
    return 24;
  }

  CloseHandle(process.hThread);
  if (WaitForSingleObject(process.hProcess, INFINITE) != WAIT_OBJECT_0) {
    fsb_error("FSBNH_E_WAIT");
    CloseHandle(process.hProcess);
    free(command_line);
    free_config(&config);
    return 25;
  }
  if (!GetExitCodeProcess(process.hProcess, &child_exit)) {
    fsb_error("FSBNH_E_EXIT_CODE");
    child_exit = 26;
  }
  CloseHandle(process.hProcess);
  free(command_line);
  free_config(&config);
  return (int)child_exit;
}
