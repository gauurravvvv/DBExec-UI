# Login screenshots

Captured from the running dev server (`ng serve` on :4200) on 2026-07-21.

| File | State |
|------|-------|
| `login-credentials.png` | Default: Organisation / Username / Password → **Sign in**, with **Forgot password?** + **Use single sign-on**. |
| `login-sso.png` | SSO mode (after "Use single sign-on"): Organisation only → **Continue with SSO**, with **Forgot password?** + **Sign in with password**. |

The SSO copy follows current SaaS conventions ("Continue with SSO"). Note: the `▯`
glyphs are a dev-server-only primeicons MIME quirk under `ng serve`; icons render
normally in the production build.
