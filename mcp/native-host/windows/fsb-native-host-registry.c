#define _WIN32_WINNT 0x0600
#include <windows.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define FSB_PROTOCOL L"fsb-native-host-registry-v1"
#define FSB_KEY L"Software\\Google\\Chrome\\NativeMessagingHosts\\io.github.fullselfbrowsing.fsb_native_host"
#define FSB_ROLE_MARKER L"fsb-native-host-registry-helper-v1"
#define FSB_MAX_VALUE_BYTES 4096U
#define FSB_MAX_INPUT_BYTES (16U + FSB_MAX_VALUE_BYTES)
#define FSB_STATUS_ABSENT 1U
#define FSB_STATUS_VALUE 2U
#define FSB_STATUS_EMPTY 3U
#define FSB_STATUS_DEFAULT_ONLY 4U
#define FSB_STATUS_NONEMPTY 5U
#define FSB_STATUS_OK 6U

static const wchar_t *const fsb_role_marker = FSB_ROLE_MARKER;

static int fail(const char *identifier) {
  DWORD written = 0U;
  HANDLE error_handle = GetStdHandle(STD_ERROR_HANDLE);
  size_t length = strlen(identifier);
  if (error_handle != INVALID_HANDLE_VALUE && error_handle != NULL) {
    (void)WriteFile(error_handle, identifier, (DWORD)length, &written, NULL);
    (void)WriteFile(error_handle, "\n", 1U, &written, NULL);
  }
  return 1;
}

static int write_response(
  DWORD operation,
  DWORD status,
  DWORD registry_type,
  const BYTE *value,
  DWORD value_bytes
) {
  static const char hex[] = "0123456789abcdef";
  const size_t prefix_capacity = 160U;
  size_t output_capacity;
  char *output;
  int prefix_length;
  size_t cursor;
  DWORD written = 0U;
  HANDLE output_handle;
  DWORD index;

  if (value_bytes > FSB_MAX_VALUE_BYTES) return fail("FSBRG_E_OUTPUT");
  output_capacity = prefix_capacity + ((size_t)value_bytes * 2U);
  output = (char *)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, output_capacity);
  if (output == NULL) return fail("FSBRG_E_MEMORY");
  prefix_length = _snprintf_s(
    output,
    output_capacity,
    _TRUNCATE,
    "{\"schema\":1,\"operation\":%lu,\"status\":%lu,\"registryType\":%lu,\"valueUtf8Hex\":\"",
    (unsigned long)operation,
    (unsigned long)status,
    (unsigned long)registry_type
  );
  if (prefix_length < 0) {
    HeapFree(GetProcessHeap(), 0U, output);
    return fail("FSBRG_E_OUTPUT");
  }
  cursor = (size_t)prefix_length;
  for (index = 0U; index < value_bytes; index += 1U) {
    output[cursor] = hex[value[index] >> 4U];
    output[cursor + 1U] = hex[value[index] & 0x0fU];
    cursor += 2U;
  }
  if (cursor + 4U > output_capacity) {
    HeapFree(GetProcessHeap(), 0U, output);
    return fail("FSBRG_E_OUTPUT");
  }
  memcpy(output + cursor, "\"}\n", 4U);
  cursor += 4U;
  output_handle = GetStdHandle(STD_OUTPUT_HANDLE);
  if (
    output_handle == INVALID_HANDLE_VALUE
    || output_handle == NULL
    || cursor > (size_t)MAXDWORD
    || !WriteFile(output_handle, output, (DWORD)cursor, &written, NULL)
    || written != (DWORD)cursor
  ) {
    HeapFree(GetProcessHeap(), 0U, output);
    return fail("FSBRG_E_OUTPUT");
  }
  HeapFree(GetProcessHeap(), 0U, output);
  return 0;
}

static int query_default(DWORD operation, REGSAM view) {
  HKEY key = NULL;
  LONG result;
  DWORD type = 0U;
  DWORD value_bytes = 0U;
  wchar_t *wide_value = NULL;
  DWORD wide_characters;
  int utf8_bytes;
  BYTE *utf8_value = NULL;
  int exit_code;

  result = RegOpenKeyExW(HKEY_CURRENT_USER, FSB_KEY, 0U, KEY_QUERY_VALUE | view, &key);
  if (result == ERROR_FILE_NOT_FOUND || result == ERROR_PATH_NOT_FOUND) {
    return write_response(operation, FSB_STATUS_ABSENT, 0U, NULL, 0U);
  }
  if (result != ERROR_SUCCESS) return fail("FSBRG_E_QUERY");
  result = RegQueryValueExW(key, NULL, NULL, &type, NULL, &value_bytes);
  if (result == ERROR_FILE_NOT_FOUND) {
    RegCloseKey(key);
    return write_response(operation, FSB_STATUS_ABSENT, 0U, NULL, 0U);
  }
  if (result != ERROR_SUCCESS) {
    RegCloseKey(key);
    return fail("FSBRG_E_QUERY");
  }
  if (type != REG_SZ) {
    RegCloseKey(key);
    return write_response(operation, FSB_STATUS_VALUE, type, NULL, 0U);
  }
  if (
    value_bytes < sizeof(wchar_t)
    || value_bytes > (FSB_MAX_VALUE_BYTES * sizeof(wchar_t))
    || (value_bytes % sizeof(wchar_t)) != 0U
  ) {
    RegCloseKey(key);
    return fail("FSBRG_E_VALUE");
  }
  wide_value = (wchar_t *)HeapAlloc(
    GetProcessHeap(),
    HEAP_ZERO_MEMORY,
    (size_t)value_bytes + sizeof(wchar_t)
  );
  if (wide_value == NULL) {
    RegCloseKey(key);
    return fail("FSBRG_E_MEMORY");
  }
  result = RegQueryValueExW(key, NULL, NULL, &type, (BYTE *)wide_value, &value_bytes);
  RegCloseKey(key);
  if (
    result != ERROR_SUCCESS
    || type != REG_SZ
    || value_bytes < sizeof(wchar_t)
    || (value_bytes % sizeof(wchar_t)) != 0U
  ) {
    HeapFree(GetProcessHeap(), 0U, wide_value);
    return fail("FSBRG_E_QUERY");
  }
  wide_characters = value_bytes / (DWORD)sizeof(wchar_t);
  if (
    wide_value[wide_characters - 1U] != L'\0'
    || wcsnlen_s(wide_value, wide_characters) != (size_t)(wide_characters - 1U)
  ) {
    HeapFree(GetProcessHeap(), 0U, wide_value);
    return fail("FSBRG_E_VALUE");
  }
  utf8_bytes = WideCharToMultiByte(
    CP_UTF8,
    WC_ERR_INVALID_CHARS,
    wide_value,
    (int)(wide_characters - 1U),
    NULL,
    0,
    NULL,
    NULL
  );
  if (
    (wide_characters > 1U && utf8_bytes <= 0)
    || utf8_bytes < 0
    || (DWORD)utf8_bytes > FSB_MAX_VALUE_BYTES
  ) {
    HeapFree(GetProcessHeap(), 0U, wide_value);
    return fail("FSBRG_E_VALUE");
  }
  if (utf8_bytes > 0) {
    utf8_value = (BYTE *)HeapAlloc(GetProcessHeap(), 0U, (size_t)utf8_bytes);
    if (utf8_value == NULL) {
      HeapFree(GetProcessHeap(), 0U, wide_value);
      return fail("FSBRG_E_MEMORY");
    }
    if (WideCharToMultiByte(
      CP_UTF8,
      WC_ERR_INVALID_CHARS,
      wide_value,
      (int)(wide_characters - 1U),
      (char *)utf8_value,
      utf8_bytes,
      NULL,
      NULL
    ) != utf8_bytes) {
      HeapFree(GetProcessHeap(), 0U, utf8_value);
      HeapFree(GetProcessHeap(), 0U, wide_value);
      return fail("FSBRG_E_VALUE");
    }
  }
  exit_code = write_response(
    operation,
    FSB_STATUS_VALUE,
    REG_SZ,
    utf8_value,
    (DWORD)utf8_bytes
  );
  if (utf8_value != NULL) HeapFree(GetProcessHeap(), 0U, utf8_value);
  HeapFree(GetProcessHeap(), 0U, wide_value);
  return exit_code;
}

static int inspect_key(DWORD operation) {
  HKEY key = NULL;
  LONG result;
  DWORD subkeys = 0U;
  DWORD values = 0U;
  wchar_t value_name[2] = { L'\0', L'\0' };
  DWORD value_name_length = 1U;
  DWORD status;

  result = RegOpenKeyExW(
    HKEY_CURRENT_USER,
    FSB_KEY,
    0U,
    KEY_QUERY_VALUE | KEY_ENUMERATE_SUB_KEYS | KEY_WOW64_32KEY,
    &key
  );
  if (result == ERROR_FILE_NOT_FOUND || result == ERROR_PATH_NOT_FOUND) {
    return write_response(operation, FSB_STATUS_ABSENT, 0U, NULL, 0U);
  }
  if (result != ERROR_SUCCESS) return fail("FSBRG_E_INSPECT");
  result = RegQueryInfoKeyW(
    key, NULL, NULL, NULL, &subkeys, NULL, NULL, &values,
    NULL, NULL, NULL, NULL
  );
  if (result != ERROR_SUCCESS) {
    RegCloseKey(key);
    return fail("FSBRG_E_INSPECT");
  }
  if (subkeys == 0U && values == 0U) status = FSB_STATUS_EMPTY;
  else if (subkeys == 0U && values == 1U) {
    result = RegEnumValueW(
      key, 0U, value_name, &value_name_length, NULL, NULL, NULL, NULL
    );
    status = result == ERROR_SUCCESS && value_name_length == 0U
      ? FSB_STATUS_DEFAULT_ONLY
      : FSB_STATUS_NONEMPTY;
  } else status = FSB_STATUS_NONEMPTY;
  RegCloseKey(key);
  return write_response(operation, status, 0U, NULL, 0U);
}

static int read_write_value(wchar_t **value_out, DWORD *characters_out) {
  BYTE input[FSB_MAX_INPUT_BYTES + 1U];
  DWORD total = 0U;
  DWORD count = 0U;
  HANDLE input_handle = GetStdHandle(STD_INPUT_HANDLE);
  uint32_t version;
  uint32_t value_bytes;
  int wide_characters;
  wchar_t *wide_value;
  wchar_t canonical[FSB_MAX_VALUE_BYTES + 1U];
  DWORD canonical_length;
  DWORD index;

  if (input_handle == INVALID_HANDLE_VALUE || input_handle == NULL) return 0;
  while (total <= FSB_MAX_INPUT_BYTES) {
    if (!ReadFile(
      input_handle,
      input + total,
      (DWORD)sizeof(input) - total,
      &count,
      NULL
    )) {
      if (GetLastError() == ERROR_BROKEN_PIPE) break;
      return 0;
    }
    if (count == 0U) break;
    total += count;
  }
  if (total < 16U || total > FSB_MAX_INPUT_BYTES) return 0;
  if (memcmp(input, "FSBRGI1\0", 8U) != 0) return 0;
  memcpy(&version, input + 8U, sizeof(version));
  memcpy(&value_bytes, input + 12U, sizeof(value_bytes));
  if (
    version != 1U
    || value_bytes == 0U
    || value_bytes > FSB_MAX_VALUE_BYTES
    || total != 16U + value_bytes
  ) return 0;
  wide_characters = MultiByteToWideChar(
    CP_UTF8,
    MB_ERR_INVALID_CHARS,
    (const char *)(input + 16U),
    (int)value_bytes,
    NULL,
    0
  );
  if (wide_characters <= 0 || (DWORD)wide_characters > FSB_MAX_VALUE_BYTES) return 0;
  wide_value = (wchar_t *)HeapAlloc(
    GetProcessHeap(),
    HEAP_ZERO_MEMORY,
    ((size_t)wide_characters + 1U) * sizeof(wchar_t)
  );
  if (wide_value == NULL) return 0;
  if (MultiByteToWideChar(
    CP_UTF8,
    MB_ERR_INVALID_CHARS,
    (const char *)(input + 16U),
    (int)value_bytes,
    wide_value,
    wide_characters
  ) != wide_characters) {
    HeapFree(GetProcessHeap(), 0U, wide_value);
    return 0;
  }
  for (index = 0U; index < (DWORD)wide_characters; index += 1U) {
    if (wide_value[index] == L'\0' || wide_value[index] == L'\r' || wide_value[index] == L'\n') {
      HeapFree(GetProcessHeap(), 0U, wide_value);
      return 0;
    }
  }
  if (
    (wide_characters < 3)
    || (wide_value[1] != L':' && !(wide_value[0] == L'\\' && wide_value[1] == L'\\'))
    || wcsncmp(wide_value, L"\\\\?\\", 4U) == 0
    || wcsncmp(wide_value, L"\\\\.\\", 4U) == 0
  ) {
    HeapFree(GetProcessHeap(), 0U, wide_value);
    return 0;
  }
  canonical_length = GetFullPathNameW(
    wide_value,
    (DWORD)(sizeof(canonical) / sizeof(canonical[0])),
    canonical,
    NULL
  );
  if (
    canonical_length == 0U
    || canonical_length >= (DWORD)(sizeof(canonical) / sizeof(canonical[0]))
    || wcscmp(wide_value, canonical) != 0
  ) {
    HeapFree(GetProcessHeap(), 0U, wide_value);
    return 0;
  }
  *value_out = wide_value;
  *characters_out = (DWORD)wide_characters;
  return 1;
}

static int write_default(DWORD operation) {
  wchar_t *value = NULL;
  DWORD characters = 0U;
  HKEY key = NULL;
  DWORD disposition = 0U;
  LONG result;

  if (!read_write_value(&value, &characters)) return fail("FSBRG_E_INPUT");
  result = RegCreateKeyExW(
    HKEY_CURRENT_USER,
    FSB_KEY,
    0U,
    NULL,
    REG_OPTION_NON_VOLATILE,
    KEY_QUERY_VALUE | KEY_SET_VALUE | KEY_WOW64_32KEY,
    NULL,
    &key,
    &disposition
  );
  if (result == ERROR_SUCCESS) {
    result = RegSetValueExW(
      key,
      NULL,
      0U,
      REG_SZ,
      (const BYTE *)value,
      (characters + 1U) * (DWORD)sizeof(wchar_t)
    );
    RegCloseKey(key);
  }
  SecureZeroMemory(value, ((size_t)characters + 1U) * sizeof(wchar_t));
  HeapFree(GetProcessHeap(), 0U, value);
  if (result != ERROR_SUCCESS) return fail("FSBRG_E_WRITE");
  return write_response(operation, FSB_STATUS_OK, 0U, NULL, 0U);
}

static int delete_default(DWORD operation) {
  HKEY key = NULL;
  LONG result = RegOpenKeyExW(
    HKEY_CURRENT_USER,
    FSB_KEY,
    0U,
    KEY_SET_VALUE | KEY_WOW64_32KEY,
    &key
  );
  if (result == ERROR_SUCCESS) {
    result = RegDeleteValueW(key, NULL);
    RegCloseKey(key);
  }
  if (result != ERROR_SUCCESS) return fail("FSBRG_E_DELETE_VALUE");
  return write_response(operation, FSB_STATUS_OK, 0U, NULL, 0U);
}

static int delete_empty_key(DWORD operation) {
  HKEY key = NULL;
  DWORD subkeys = 0U;
  DWORD values = 0U;
  LONG result = RegOpenKeyExW(
    HKEY_CURRENT_USER,
    FSB_KEY,
    0U,
    KEY_QUERY_VALUE | KEY_ENUMERATE_SUB_KEYS | KEY_WOW64_32KEY,
    &key
  );
  if (result == ERROR_SUCCESS) {
    result = RegQueryInfoKeyW(
      key, NULL, NULL, NULL, &subkeys, NULL, NULL, &values,
      NULL, NULL, NULL, NULL
    );
    RegCloseKey(key);
  }
  if (result != ERROR_SUCCESS || subkeys != 0U || values != 0U) {
    return fail("FSBRG_E_DELETE_KEY");
  }
  result = RegDeleteKeyExW(HKEY_CURRENT_USER, FSB_KEY, KEY_WOW64_32KEY, 0U);
  if (result != ERROR_SUCCESS) return fail("FSBRG_E_DELETE_KEY");
  return write_response(operation, FSB_STATUS_OK, 0U, NULL, 0U);
}

int wmain(int argc, wchar_t **argv) {
  wchar_t *end = NULL;
  unsigned long operation;
  if (fsb_role_marker[0] == L'\0') return fail("FSBRG_E_ROLE");
  if (argc != 3 || wcscmp(argv[1], FSB_PROTOCOL) != 0) return fail("FSBRG_E_ARGS");
  operation = wcstoul(argv[2], &end, 10);
  if (end == argv[2] || *end != L'\0') return fail("FSBRG_E_ARGS");
  switch (operation) {
    case 1UL: return query_default(1U, KEY_WOW64_32KEY);
    case 2UL: return query_default(2U, KEY_WOW64_64KEY);
    case 3UL: return inspect_key(3U);
    case 4UL: return write_default(4U);
    case 5UL: return delete_default(5U);
    case 6UL: return delete_empty_key(6U);
    default: return fail("FSBRG_E_ARGS");
  }
}
