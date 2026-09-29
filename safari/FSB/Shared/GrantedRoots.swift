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
//  message is sent. A path must pass BOTH to be read.
//

import Foundation
import Security

enum GrantedRoots {

    private static let appGroupSuffix = "com.fullselfbrowsing.fsb"
    private static let appGroupsEntitlement = "com.apple.security.application-groups"
    private static let defaultsKey = "fsbGrantedRootBookmarks"

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

    private static var defaults: UserDefaults? {
        // The App Group suite is what makes a grant taken in the app visible to
        // the extension process.
        guard let appGroupId else { return nil }
        return UserDefaults(suiteName: appGroupId)
    }

    // MARK: - Grant (container app)

    /// Persist a user-selected directory as a security-scoped bookmark.
    static func addGrant(_ url: URL) throws {
        guard let defaults else { throw GrantError.appGroupUnavailable }
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
        defaults.set(all, forKey: defaultsKey)
    }

    static func clearGrants() {
        defaults?.removeObject(forKey: defaultsKey)
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
        defaults?.array(forKey: defaultsKey) as? [Data] ?? []
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

    /// Find the granted root that contains `path`, with access already started.
    ///
    /// Containment is checked on SYMLINK-RESOLVED, standardized paths and at a
    /// path-COMPONENT boundary. Both matter:
    ///   - a plain string prefix would let /Users/me/Downloads-old satisfy a
    ///     grant for /Users/me/Downloads
    ///   - without resolving symlinks, a link placed inside the granted folder
    ///     could point at ~/.ssh and escape the grant entirely
    static func rootContaining(_ path: String) -> Resolved? {
        let target = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL
        let targetComponents = target.pathComponents

        for data in storedBookmarks() {
            guard let resolved = resolve(data) else { continue }
            let root = resolved.url.resolvingSymlinksInPath().standardizedFileURL
            let rootComponents = root.pathComponents

            let contained = targetComponents.count > rootComponents.count
                && Array(targetComponents.prefix(rootComponents.count)) == rootComponents

            if contained { return Resolved(url: resolved.url, stale: resolved.stale) }
            resolved.url.stopAccessingSecurityScopedResource()
        }
        return nil
    }
}
