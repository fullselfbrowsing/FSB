import type { NativeHostPlatform } from '../native-host/runtime-layout.js';

export type NativeHostOwnedState =
  | 'absent'
  | 'exact'
  | 'foreign'
  | 'mismatched'
  | 'invalid'
  | 'unavailable';

export type NativeHostRegistryView = 'user/32' | 'user/64';

export type NativeHostRegistrationKind = 'file' | 'registry';

export type NativeHostFileFact =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'symlink' }>
  | Readonly<{ status: 'other' }>
  | Readonly<{
      status: 'file';
      path: string;
      realPath: string;
      contents: string;
    }>;

export type NativeHostRegistryValueFact =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{
      status: 'value';
      type: string;
      value: string;
    }>;

export type NativeHostRegistryKeyFact =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'empty' }>
  | Readonly<{ status: 'nonempty' }>
  | Readonly<{ status: 'unavailable' }>;

export interface NativeHostInstallFileAdapter {
  inspectFile(pathname: string, maxBytes: number): Promise<NativeHostFileFact>;
  writePrivateFileAtomic(
    pathname: string,
    contents: string,
    mode: number,
  ): Promise<void>;
  removeFile(pathname: string): Promise<void>;
}

export interface NativeHostInstallRegistryAdapter {
  readDefault(
    view: NativeHostRegistryView,
    key: string,
  ): Promise<NativeHostRegistryValueFact>;
  writeDefault(
    view: NativeHostRegistryView,
    key: string,
    value: Readonly<{ type: 'REG_SZ'; value: string }>,
  ): Promise<void>;
  deleteDefault(view: NativeHostRegistryView, key: string): Promise<void>;
  inspectKey(
    view: NativeHostRegistryView,
    key: string,
  ): Promise<NativeHostRegistryKeyFact>;
  deleteEmptyKey(view: NativeHostRegistryView, key: string): Promise<void>;
}

export interface NativeHostInstallPlatformDependencies {
  files: NativeHostInstallFileAdapter;
  registry?: NativeHostInstallRegistryAdapter;
}

export type NativeHostFileRegistration = Readonly<{
  kind: 'file';
}>;

export type NativeHostRegistryRegistration = Readonly<{
  kind: 'registry';
  key: string;
  canonicalView: 'user/32';
  shadowView: 'user/64';
}>;

export interface NativeHostInstallPlatformLayout {
  platform: NativeHostPlatform;
  stableRoot: string;
  manifestPath: string;
  markerPath: string;
  launcherPath: string;
  registration: NativeHostFileRegistration | NativeHostRegistryRegistration;
}

export interface NativeHostRegistrationReadFacts {
  manifest: NativeHostFileFact;
  registry32?: NativeHostRegistryValueFact;
  registry64?: NativeHostRegistryValueFact;
}

export interface NativeHostInstallPlatformAdapter {
  readonly layout: NativeHostInstallPlatformLayout;
  readRegistrationFacts(): Promise<NativeHostRegistrationReadFacts>;
  publishRegistration(contents: string): Promise<void>;
  removeCanonicalRegistration(): Promise<void>;
  inspectCanonicalKey(): Promise<NativeHostRegistryKeyFact>;
  deleteCanonicalKeyIfEmpty(): Promise<void>;
}

export interface NativeHostRegistrationInspectionInput {
  layout: NativeHostInstallPlatformLayout;
  extensionId: string;
  manifest: NativeHostFileFact;
  marker: NativeHostFileFact;
  registry32?: NativeHostRegistryValueFact;
  registry64?: NativeHostRegistryValueFact;
}

export interface NativeHostRegistrationInspection<
  Manifest = unknown,
  Marker = unknown,
> {
  state: NativeHostOwnedState;
  reason: string;
  manifest: Manifest | null;
  marker: Marker | null;
}

export interface NativeHostProcessInvocation {
  executable: string;
  argv: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string>>;
  shell: false;
  maxOutputBytes: number;
}

export type NativeHostProcessResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
  networkRequests: number;
}>;

export interface NativeHostProcessMaterializer {
  run(invocation: NativeHostProcessInvocation): Promise<NativeHostProcessResult>;
}
