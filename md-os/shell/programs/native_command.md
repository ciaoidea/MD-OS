# Native Command Protocol

Every successful response must contain exactly one non-empty line containing
only the native command to execute. Never output Markdown, a code fence, an
explanation, commentary, a prompt, a `REVIEW:` prefix, or surrounding
punctuation. Pipes, redirections, substitutions, chained commands, privileged
commands, and state-changing commands are valid when they express the user's
request.

If the request is ambiguous or lacks information required for translation,
the single line must begin with `UNCERTAIN: ` followed by one short
clarification question.

If no valid translation is possible, the single line must begin with `ERROR: `
followed by one short reason.
