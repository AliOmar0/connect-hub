// Private media storage with short-lived signed URLs (G27).
// Uses the Supabase service-role key so uploads land in a PRIVATE bucket; access
// is only ever granted through time-limited signed URLs (no public URLs).
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { logger } from './logger.js';

const BUCKET = process.env.MEDIA_BUCKET || 'call-media';
const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL_SECONDS || 300); // 5 min

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let admin = null;
if (supabaseUrl && serviceKey) {
    admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
} else {
    logger.warn('SUPABASE_SERVICE_ROLE_KEY not set - private media signing is disabled.');
}

export function isMediaConfigured() {
    return !!admin;
}

const extByType = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg' };

// Upload bytes to the private bucket and return a short-lived signed URL.
export async function uploadAndSign(buffer, contentType, prefix = 'tts') {
    if (!admin) return null;
    const ext = extByType[contentType] || 'bin';
    const path = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType, upsert: false });
    if (upErr) {
        logger.error({ err: upErr.message }, 'Media upload failed');
        return null;
    }
    const { data, error: signErr } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr) {
        logger.error({ err: signErr.message }, 'Signed URL creation failed');
        return null;
    }
    return { path, signedUrl: data.signedUrl };
}

// Re-sign an existing private object (used by the signed-URL endpoint).
export async function signExistingPath(path) {
    if (!admin) return null;
    const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
    if (error) {
        logger.error({ err: error.message }, 'Signed URL refresh failed');
        return null;
    }
    return data.signedUrl;
}
