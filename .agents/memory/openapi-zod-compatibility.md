---
name: OpenAPI codegen Zod compatibility
description: Compatibility constraint observed when generating validation schemas from OpenAPI in this workspace.
---

When authoring OpenAPI for this workspace, prefer plain `string` and `number` schema types unless the generated Zod target is confirmed to support newer helpers such as `z.email()` and `z.int()`.

**Why:** The installed Zod runtime is v3 while the generator can emit v4-style helpers for `format: email` and integer schemas, causing `typecheck:libs` to fail after otherwise successful codegen.

**How to apply:** Run codegen plus the chained library typecheck immediately after changing the spec; simplify generated-incompatible formats before building routes or frontend hooks.