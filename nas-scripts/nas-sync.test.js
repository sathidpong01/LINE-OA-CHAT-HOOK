const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
    storageObjectUrl,
    localMediaPath,
    shouldBackupMedia,
} = require("./nas-sync");

test("builds an encoded Supabase storage object URL", () => {
    const url = storageObjectUrl(
        "https://example.supabase.co",
        "line-message-media",
        "2026/05/15/U abc/message 1.jpg",
    );

    assert.equal(
        url,
        "https://example.supabase.co/storage/v1/object/line-message-media/2026/05/15/U%20abc/message%201.jpg",
    );
});

test("maps a media object path into the local media backup directory", () => {
    const filePath = localMediaPath(
        "Y:\\raw_logs_media",
        "2026/05/15/U-test/613.jpg",
    );

    assert.equal(filePath, path.join("Y:\\raw_logs_media", "2026", "05", "15", "U-test", "613.jpg"));
});

test("backs up only media rows that have not been marked as backed up", () => {
    assert.equal(shouldBackupMedia({ media_path: "2026/05/15/a.jpg", media_backed_up_at: null }), true);
    assert.equal(shouldBackupMedia({ media_path: "2026/05/15/a.jpg", media_backed_up_at: "2026-05-15T00:00:00Z" }), false);
    assert.equal(shouldBackupMedia({ media_path: null, media_backed_up_at: null }), false);
});
