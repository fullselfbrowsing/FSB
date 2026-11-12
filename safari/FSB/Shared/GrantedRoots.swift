//
//  GrantedRoots.swift
//  FSB — shared by the container app and the Safari web extension target.
//
//  App Sandbox means the extension CANNOT read arbitrary absolute paths, so
//  upload_file cannot simply be handed a path the way Chrome's
//  DOM.setFileInputFiles is. Instead the user grants a folder ONCE in the
//  container app (NSOpenPanel), and the grant is persisted as a
//  security-scoped bookmark in the shared App Group. The extension resolves
//  those bookmarks and will only read files contained by one of them.
//
//  This constraint applies to BOTH distribution channels, not just the App
//  Store: the extension target is sandboxed regardless of how it ships.
//
//  LAYERING: this is an ADDITIONAL constraint, never a replacement. The
//  sensitive-path denylist + audit chokepoint in background.js
//  (executeUploadFile) still runs first, in the extension, before any native
//  message is sent, and again on the resolved path FileReadService reports
//  back, before any bytes are fetched. A path must pass BOTH to be read.
//

import Foundation
import Security

enum GrantedRoots {

    private static let appGroupSuffix = "com.fullselfbrowsing.fsb"
    private static let appGroupsEntitlement = "com.apple.security.application-groups"
    private static let storeFileName = "granted-roots.plist"

    enum GrantError: LocalizedError {
        case appGroupUnavailable

        var errorDescription: String? {
            switch self {
            case .appGroupUnavailable:
                return "FSB's shared App Group is unavailable. Check the app and extension signing entitlements."
            }
        }
    }

    /// Read the fully expanded identifier from the signed entitlement instead
    /// of guessing the signing team's prefix. This returns the same value in
    /// the container app and extension process.
    static let appGroupId: String? = {
        guard let task = SecTaskCreateFromSelf(nil),
              let groups = SecTaskCopyValueForEntitlement(
                  task,
                  appGroupsEntitlement as CFString,
                  nil
              ) as? [String]
        else { return nil }

        return groups.first {
            $0 == appGroupSuffix || $0.hasSuffix("." + appGroupSuffix)
        }
    }()

    /// The grants live in a FILE in the shared App Group container, not in an
    /// App Group UserDefaults suite. Preferences are cached per process, so a
    /// grant the app wrote stayed invisible to an already-running extension
    /// process until Safari quit -- the upload retry right after granting still
    /// said no_granted_folders. An atomically written file re-read on every
    /// lookup has no such cache.
    private static var storeURL: URL? {
        guard let appGroupId,
              let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
        else { return nil }
        return dir.appendingPathComponent(storeFileName)
    }

    // MARK: - Grant (container app)

    /// Persist a user-selected directory as a security-scoped bookmark.
    static func addGrant(_ url: URL) throws {
        guard let storeURL else { throw GrantError.appGroupUnavailable }
        let bookmark = try url.bookmarkData(options: .withSecurityScope,
                                            includingResourceValuesForKeys: nil,
                                            relativeTo: nil)
        var all = storedBookmarks()
        // De-duplicate by resolved path so re-granting the same folder does not
        // pile up stale bookmarks.
        let incoming = url.resolvingSymlinksInPath().standardizedFileURL.path
        all.removeAll { data in
            guard let resolved = resolve(data) else { return false }
            defer { resolved.url.stopAccessingSecurityScopedResource() }
            return resolved.url.resolvingSymlinksInPath().standardizedFileURL.path == incoming
        }
        all.append(bookmark)
        try FileManager.default.createDirectory(at: storeURL.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try PropertyListEncoder().encode(all).write(to: storeURL, options: .atomic)
    }

    static func clearGrants() {
        guard let storeURL else { return }
        try? FileManager.default.removeItem(at: storeURL)
    }

    /// Human-readable list of granted roots, for the app UI and for error text.
    static func grantedPaths() -> [String] {
        storedBookmarks().compactMap { data in
            guard let resolved = resolve(data) else { return nil }
            defer { resolved.url.stopAccessingSecurityScopedResource() }
            return resolved.url.standardizedFileURL.path
        }
    }

    // MARK: - Resolve (extension)

    struct Resolved {
        let url: URL
        let stale: Bool
    }

    private static func storedBookmarks() -> [Data] {
        guard let storeURL, let data = try? Data(contentsOf: storeURL) else { return [] }
        return (try? PropertyListDecoder().decode([Data].self, from: data)) ?? []
    }

    /// Resolve a bookmark and BEGIN security-scoped access. The caller owns the
    /// matching stopAccessingSecurityScopedResource().
    private static func resolve(_ data: Data) -> Resolved? {
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data,
                                 options: .withSecurityScope,
                                 relativeTo: nil,
                                 bookmarkDataIsStale: &stale)
        else { return nil }
        guard url.startAccessingSecurityScopedResource() else { return nil }
        return Resolved(url: url, stale: stale)
    }

    struct Containment {
        /// Access already started; the caller owns the matching stop.
        let root: Resolved
        /// The target as resolved under `root`'s access. Read this url, never
        /// the requested path: it is the one the containment check approved.
        let target: URL
    }

    /// Find the granted root that contains `path`, with access already started.
    ///
    /// Containment is checked on SYMLINK-RESOLVED, standardized paths and at a
    /// path-COMPONENT boundary. Both matter:
    ///   - a plain string prefix would let /Users/me/Downloads-old satisfy a
    ///     grant for /Users/me/Downloads
    ///   - without resolving symlinks, a link placed inside the granted folder
    ///     could point at ~/.ssh and escape the grant entirely
    ///
    /// The target is resolved per root, only once that root's access has
    /// started. Before then the sandbox hides a link inside the grant, and
    /// resolvingSymlinksInPath does not fail on a link it cannot read -- it
    /// returns the link's own path, which IS contained. Resolving up front let
    /// a link to ~/.ssh pass this check and then be followed by the read.
    static func rootContaining(_ path: String) -> Containment? {
        for data in storedBookmarks() {
            guard let resolved = resolve(data) else { continue }
            let root = resolved.url.resolvingSymlinksInPath().standardizedFileURL
            let target = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL
            let rootComponents = root.pathComponents
            let targetComponents = target.pathComponents

            let contained = targetComponents.count > rootComponents.count
                && Array(targetComponents.prefix(rootComponents.count)) == rootComponents

            if contained { return Containment(root: resolved, target: target) }
            resolved.url.stopAccessingSecurityScopedResource()
        }
        return nil
    }
}
