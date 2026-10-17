// ==UserScript==
// @name         TikTok Studio Raw Master Uploader (Chống nén mờ video)
// @namespace    https://datgaming1305.github.io/tiktok-quality-tool/
// @version      2.0
// @description  Bypass triệt để cơ chế nén Cloud Canvas trên TikTok Studio web. Đảm bảo video được tiếp nhận ở dạng Direct Raw Master, không bị bóp chất lượng và không bị lỗi tua video.
// @author       TikTok Quality Optimizer
// @match        https://www.tiktok.com/tiktokstudio/*
// @match        https://www.tiktok.com/creator-center/upload*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('[TikTok Raw Uploader] Helper đã kích hoạt! Đang bảo vệ luồng upload...');

    const originalStringify = JSON.stringify;

    /**
     * Làm sạch payload xuất bản của TikTok Studio:
     * - Xóa bỏ canvas_config, draft, vedit_segment_info (những cờ kích hoạt bộ nén cloud canvas)
     * - Tắt cloud_edit_is_use_video_canvas
     * - Chuyển post_type sang 3 (Direct Raw Video Upload)
     */
    function cleanPayload(obj) {
        if (!obj || typeof obj !== 'object') return;

        const canvasKeys = ['draft', 'canvas_config', 'vedit_segment_info'];
        canvasKeys.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                delete obj[key];
            }
        });

        if (obj.cloud_edit_is_use_video_canvas !== undefined) {
            obj.cloud_edit_is_use_video_canvas = false;
        }

        if (obj.post_type === 2) {
            obj.post_type = 3;
        }

        if (obj.enter_post_page_from !== undefined) {
            obj.enter_post_page_from = 1;
        }

        for (const k in obj) {
            if (obj[k] && typeof obj[k] === 'object') {
                cleanPayload(obj[k]);
            }
        }
    }

    // Hook vào JSON.stringify để can thiệp đúng lúc TikTok Studio đóng gói request gửi lên máy chủ
    JSON.stringify = function (val, replacer, space) {
        if (val && typeof val === 'object') {
            try {
                if (val.single_post_req_list || val.vedit_common_info || val.post_common_info) {
                    cleanPayload(val);
                    console.log('[TikTok Raw Uploader] Đã làm sạch payload -> Ép nhận dạng Direct Raw Master!');
                }
            } catch (err) {
                console.warn('[TikTok Raw Uploader] Hook payload notice:', err);
            }
        }
        return originalStringify.apply(this, arguments);
    };

})();
