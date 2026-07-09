---
phase: 56-locale-cookie-redirect-fix-warning-02
plan: 01
---
# Plan 56-01 Summary

Changed Accept-Language middleware so a valid non-default `fsb-locale` cookie 302-redirects bare `/` to `/{locale}/`, while `en` still falls through. Updated unit tests; 43 passed.

## One-liner
Closed WARNING-02: picker cookie now redirects returning visitors to their locale.
