# Follow-up: News Initial HTML Metadata

Status: OPEN. Separate from the public News noindex correction.

News detail initial HTML metadata / canonical is homepage until JS execution.

The SPA updates each article's title, description, and canonical after JavaScript
executes. The initial HTTP HTML still contains homepage metadata. Removing the
incorrect article noindex exception does not resolve this separate limitation.

A future, separately approved SEO task should ensure that direct News detail
responses contain the correct article metadata before JavaScript execution,
while preserving not-found and private-page indexing restrictions.

No SSR, router, or SEO framework changes are included in this task.
