<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- The whole app is one route (`src/routes/index.tsx`) with client-side tab switching — the spec requires a single shareable page, so do not add routing.
- Device registry reads/writes go through the browser Supabase client; lookups are public by RLS so scanning works without an account.
