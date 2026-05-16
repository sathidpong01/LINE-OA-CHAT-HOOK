const test = require("node:test");
const assert = require("node:assert/strict");

const {
    cleanupCandidatesUrl,
    deleteStorageObjectUrl,
    shouldCleanupMedia,
} = require("./nas-cleanup-media");

test("builds a cleanup candidate query for backed-up media older than cutoff", () => {
    const url = cleanupCandidatesUrl(
        "https://example.supabase.co",
        "2026-05-14T00:00:00.000Z",
        50,
    );

    assert.equal(
        url,
        "https://example.supabase.co/rest/v1/line_messages?select=id%2Cmedia_bucket%2Cmedia_path%2Cmedia_backed_up_at%2Cmedia_deleted_at&media_path=not.is.null&media_backed_up_at=lt.2026-05-14T00%3A00%3A00.000Z&media_deleted_at=is.null&order=media_backed_up_at.asc&limit=50",
    );
});

test("builds an encoded Storage API delete URL", () => {
    const url = deleteStorageObjectUrl(
        "https://example.supabase.co",
        "line-message-media",
        "2026/05/15/U abc/message 1.jpg",
    );

    assert.equal(
        url,
        "https://example.supabase.co/storage/v1/object/line-message-media/2026/05/15/U%20abc/message%201.jpg",
    );
});

test("cleans up only media rows already backed up before the grace cutoff", () => {
    const cutoff = new Date("2026-05-14T00:00:00.000Z");

    assert.equal(shouldCleanupMedia({
        media_path: "2026/05/12/a.jpg",
        media_backed_up_at: "2026-05-13T23:59:59.000Z",
        media_deleted_at: null,
    }, cutoff), true);

    assert.equal(shouldCleanupMedia({
        media_path: "2026/05/12/a.jpg",
        media_backed_up_at: "2026-05-14T00:00:00.000Z",
        media_deleted_at: null,
    }, cutoff), false);

    assert.equal(shouldCleanupMedia({
        media_path: "2026/05/12/a.jpg",
        media_backed_up_at: "2026-05-13T00:00:00.000Z",
        media_deleted_at: "2026-05-15T00:00:00.000Z",
    }, cutoff), false);

    assert.equal(shouldCleanupMedia({
        media_path: null,
        media_backed_up_at: "2026-05-13T00:00:00.000Z",
        media_deleted_at: null,
    }, cutoff), false);
});
