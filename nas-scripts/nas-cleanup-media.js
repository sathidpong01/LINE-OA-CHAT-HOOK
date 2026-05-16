/**
 * LINE OA Pending Chat Checker - Supabase media cleanup for NAS
 *
 * Deletes remote Supabase Storage files only after they have been marked as
 * backed up by nas-sync.js. Database rows are kept for audit/report context.
 */

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_BUCKET = process.env.MEDIA_BUCKET || "line-message-media";
const GRACE_DAYS = Number.parseInt(process.env.MEDIA_DELETE_GRACE_DAYS || "2", 10);
const CLEANUP_LIMIT = Math.min(Number.parseInt(process.env.MEDIA_CLEANUP_LIMIT || "100", 10), 1000);
const BASE_MEDIA_DIR = process.env.BASE_MEDIA_DIR || "";
const CONFIRM_REMOTE_MEDIA_DELETE = process.env.CONFIRM_REMOTE_MEDIA_DELETE === "true";

function encodedObjectPath(objectPath) {
    return objectPath.split("/").map(encodeURIComponent).join("/");
}

function cleanupCandidatesUrl(supabaseUrl, cutoffIso, limit) {
    const params = new URLSearchParams();
    params.set("select", "id,media_bucket,media_path,media_backed_up_at,media_deleted_at");
    params.set("media_path", "not.is.null");
    params.set("media_backed_up_at", `lt.${cutoffIso}`);
    params.set("media_deleted_at", "is.null");
    params.set("order", "media_backed_up_at.asc");
    params.set("limit", String(limit));

    return `${supabaseUrl}/rest/v1/line_messages?${params.toString()}`;
}

function deleteStorageObjectUrl(supabaseUrl, bucket, objectPath) {
    return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedObjectPath(objectPath)}`;
}

function localMediaPath(baseMediaDir, objectPath) {
    return path.join(baseMediaDir, ...objectPath.split("/"));
}

function shouldCleanupMedia(message, cutoffDate) {
    if (!message || !message.media_path || !message.media_backed_up_at || message.media_deleted_at) {
        return false;
    }

    const backedUpAt = new Date(message.media_backed_up_at);
    return !Number.isNaN(backedUpAt.valueOf()) && backedUpAt < cutoffDate;
}

function cutoffDate(now = new Date(), graceDays = GRACE_DAYS) {
    return new Date(now.getTime() - (graceDays * 24 * 60 * 60 * 1000));
}

function authHeaders(extra = {}) {
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        ...extra,
    };
}

async function fetchCleanupCandidates(cutoffIso, limit = CLEANUP_LIMIT) {
    const response = await fetch(cleanupCandidatesUrl(SUPABASE_URL, cutoffIso, limit), {
        headers: authHeaders(),
    });

    if (!response.ok) {
        throw new Error(`Supabase candidate query error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

async function deleteStorageObject(message) {
    const bucket = message.media_bucket || DEFAULT_BUCKET;
    const response = await fetch(deleteStorageObjectUrl(SUPABASE_URL, bucket, message.media_path), {
        method: "DELETE",
        headers: authHeaders(),
    });

    if (response.ok || response.status === 404) {
        return response.status === 404 ? "missing" : "deleted";
    }

    throw new Error(`Storage delete error: ${response.status} ${response.statusText}`);
}

async function markMediaDeleted(messageId, deletedAtIso) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/line_messages?id=eq.${messageId}`, {
        method: "PATCH",
        headers: authHeaders({
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }),
        body: JSON.stringify({
            media_deleted_at: deletedAtIso,
            media_error: null,
        }),
    });

    if (!response.ok) {
        throw new Error(`Supabase delete marker error: ${response.status} ${response.statusText}`);
    }
}

function hasLocalBackup(message) {
    if (!BASE_MEDIA_DIR || !message.media_path) return true;
    return fs.existsSync(localMediaPath(BASE_MEDIA_DIR, message.media_path));
}

async function cleanupMedia() {
    if (typeof fetch === "undefined") {
        throw new Error("สคริปต์นี้ต้องการ Node.js version 18 ขึ้นไป (เพื่อใช้ native fetch)");
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY เป็น Environment Variables");
    }

    const cutoff = cutoffDate();
    const cutoffIso = cutoff.toISOString();
    const candidates = await fetchCleanupCandidates(cutoffIso);
    let deleted = 0;
    let skipped = 0;

    console.log(`[Cleanup] cutoff: ${cutoffIso}`);
    console.log(`[Cleanup] พบ candidate ${candidates.length} รายการ`);

    for (const message of candidates) {
        if (!shouldCleanupMedia(message, cutoff)) {
            skipped += 1;
            continue;
        }

        if (!hasLocalBackup(message)) {
            skipped += 1;
            console.warn(`[Cleanup Skip] ไม่พบไฟล์ backup ใน NAS id=${message.id} path=${message.media_path}`);
            continue;
        }

        if (!CONFIRM_REMOTE_MEDIA_DELETE) {
            skipped += 1;
            console.log(`[Dry Run] จะลบ remote media id=${message.id} path=${message.media_path}`);
            continue;
        }

        try {
            const result = await deleteStorageObject(message);
            await markMediaDeleted(message.id, new Date().toISOString());
            deleted += 1;
            console.log(`[Cleanup] ${result}: id=${message.id} path=${message.media_path}`);
        } catch (error) {
            skipped += 1;
            console.error(`[Cleanup Error] id=${message.id}: ${error.message}`);
        }
    }

    console.log(`[Cleanup] ลบแล้ว ${deleted} รายการ, ข้าม ${skipped} รายการ`);
}

if (require.main === module) {
    cleanupMedia().catch((error) => {
        console.error("[Cleanup Fatal]", error.message);
        process.exit(1);
    });
}

module.exports = {
    cleanupCandidatesUrl,
    deleteStorageObjectUrl,
    shouldCleanupMedia,
    cutoffDate,
    cleanupMedia,
};
