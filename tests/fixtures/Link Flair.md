# Link Flair

An authored [Deployment guide](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) beside ordinary text.

https://obsidian.md

## App links

- [Codex task](codex://threads/00000000-0000-0000-0000-000000000000)
- [Open a note](obsidian://open?vault=Link%20Flair&file=Related%20note)
- [Mind map](mindnode://open?document=example)
- [Source file](zed://file/tmp/example.ts:12:3)
- [Things inbox](things:///show?id=inbox)
- codex://threads/00000000-0000-0000-0000-000000000000
- obsidian://open?vault=Link%20Flair&file=Related%20note
- mindnode://open?document=example
- zed://file/tmp/example.ts:12:3
- things:///show?id=inbox
- [ChatGPT conversation](chatgpt-conversation://00000000-0000-0000-0000-000000000000)
- [Anybox bookmark](anybox://item/example)
- chatgpt-conversation://00000000-0000-0000-0000-000000000000
- anybox://item/example
- [An unsupported app](other-app://open?id=abc%2Fdef)
- other-app://open?id=abc%2Fdef

These example app URLs test presentation; they are not asserted to reference existing items.

## Native links

[[Related note]] · [[Related note|Custom label]] · [[Related note#Details]] · [[Related note#^example]] · [A Markdown note link](Related%20note.md)

[[Missing note]] · [[#App links]]

## Edge cases

[A **bold** and `code` label](https://example.com/a_(b)?q=one&next=two#part)

[A deliberately long link label that needs to wrap correctly in a narrow note pane without losing its icon or forcing horizontal scrolling](https://example.com/long)

Reference [the docs][docs] and [a second reference][docs].

[docs]: https://obsidian.md "Documentation"

An explicit URL label: [https://example.com](https://example.com).

Inline code stays untouched: `things:///show?id=inbox` and `[[Related note]]`.

```markdown
[A code example](https://example.com)
codex://threads/example
[[Related note]]
```

> [!note] Links in a callout
> [Things inbox](things:///show?id=inbox) and [[Related note]].

| Kind | Link |
| --- | --- |
| Web | [Documentation](https://obsidian.md) |
| App | [Things](things:///show?id=inbox) |
| Native | [[Related note]] |
