# Security

FinanceDash runs on your own computer and has **no login**. By default it only accepts connections from
the same machine (`HOST=127.0.0.1`). Setting `HOST` to anything else makes your financial data readable
and editable by anyone who can reach that address, so only do it on a network you trust, and never
expose it to the internet.

Keep these out of version control and backups you share: `.env` (your API keys and `PLAID_TOKEN_KEY`),
`*.db` files and the `backups/` folder. They are already in `.gitignore`.

## Reporting a vulnerability

Please report security problems privately, using GitHub's **Report a vulnerability** button on the
repository's Security tab, rather than opening a public issue. Include what you found, how to reproduce
it and what it could affect. You'll get a reply as soon as possible.
