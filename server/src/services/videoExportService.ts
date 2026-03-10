import db from '../db/index.js';
import { Router, Request, Response } from 'express';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');

export const videoExportRouter = Router();

// 辅助函数：生成微秒时间，剪映用微秒作单位
const SEC_TO_MICRO = 1000000;

videoExportRouter.get('/api/export/jianying', async (req: Request, res: Response) => {
    try {
        const scriptId = Number(req.query.scriptId);
        if (!scriptId) {
            res.status(400).send('Missing scriptId');
            return;
        }

        // 获取脚本信息和项目信息
        const script = await db('t_script').where('id', scriptId).first();
        if (!script) {
            res.status(404).send('Script not found');
            return;
        }

        const project = await db('t_project').where('id', script.projectId).first();
        const projectName = project ? project.name : `Draft_${scriptId}`;

        // 获取所有分镜
        const shots = await db('t_storyboard').where('scriptId', scriptId).orderBy('segmentIndex').orderBy('shotIndex');

        const materialsVideos: any[] = [];
        const materialsAudios: any[] = [];
        const videoSegments: any[] = [];
        const audioSegments: any[] = [];

        let currentMicroTime = 0; // 当前时间线时间

        for (const shot of shots) {
            // 获取该分镜关联的最新的成功视频
            const videoConfigs = await db('t_videoConfig').where('storyboardId', shot.id).select('id');
            const configIds = videoConfigs.map(c => c.id);
            let videoResult = null;
            if (configIds.length > 0) {
                videoResult = await db('t_video')
                    .whereIn('configId', configIds)
                    .where('state', 1)
                    .whereNotNull('filePath')
                    .orderBy('createTime', 'desc')
                    .first();
            }

            // 获取时长
            let durationSec = shot.shotDuration || 5;
            if (videoResult && videoResult.duration) {
                durationSec = videoResult.duration;
            }
            const durationMicro = Math.floor(durationSec * SEC_TO_MICRO);

            if (videoResult && videoResult.filePath) {
                const videoMatId = uuidv4();
                const absolutePath = path.join(uploadsDir, videoResult.filePath);
                if (fs.existsSync(absolutePath)) {
                    materialsVideos.push({
                        "id": videoMatId,
                        "type": "video",
                        "path": `##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##/draft_materials/${path.basename(videoResult.filePath)}`,
                        "_sourcePath": absolutePath, // 用于后续打包
                        "duration": durationMicro,
                        "material_name": path.basename(videoResult.filePath),
                        "aigc_type": "none",
                        "has_audio": false,
                        "is_ai_generate_content": false,
                        "width": 1080,
                        "height": 1920
                    });

                    videoSegments.push({
                        "id": uuidv4(),
                        "material_id": videoMatId,
                        "target_timerange": {
                            "start": currentMicroTime,
                            "duration": durationMicro
                        },
                        "source_timerange": {
                            "start": 0,
                            "duration": durationMicro
                        },
                        "speed": 1,
                        "volume": 1,
                        "visible": true,
                        "clip": {
                            "alpha": 1,
                            "flip": { "horizontal": false, "vertical": false },
                            "rotation": 0,
                            "scale": { "x": 1, "y": 1 },
                            "transform": { "x": 0, "y": 0 }
                        },
                        "extra_material_refs": []
                    });
                }
            }

            if (shot.audioPath) {
                const audioMatId = uuidv4();
                const absolutePath = path.join(uploadsDir, shot.audioPath);
                if (fs.existsSync(absolutePath)) {
                    materialsAudios.push({
                        "id": audioMatId,
                        "type": "extract_music",
                        "path": `##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##/draft_materials/${path.basename(shot.audioPath)}`,
                        "_sourcePath": absolutePath,
                        "duration": durationMicro,
                        "material_name": path.basename(shot.audioPath),
                        "app_id": 0,
                        "category_id": "",
                        "category_name": "local",
                        "check_flag": 1,
                        "is_ai_clone_tone": false,
                        "is_text_edit_overdub": false,
                        "is_ugc": false
                    });

                    audioSegments.push({
                        "id": uuidv4(),
                        "material_id": audioMatId,
                        "target_timerange": {
                            "start": currentMicroTime,
                            "duration": durationMicro
                        },
                        "source_timerange": {
                            "start": 0,
                            "duration": durationMicro
                        },
                        "speed": 1,
                        "volume": 1,
                        "visible": true,
                        "clip": {
                            "alpha": 1,
                            "flip": { "horizontal": false, "vertical": false },
                            "rotation": 0,
                            "scale": { "x": 1, "y": 1 },
                            "transform": { "x": 0, "y": 0 }
                        },
                        "extra_material_refs": []
                    });
                }
            }

            currentMicroTime += durationMicro;
        }

        const draftId = uuidv4();
        const draftMetaInfo = {
            "draft_cloud_last_action_download": false,
            "draft_cloud_purchase_info": "",
            "draft_cloud_template_id": "",
            "draft_cloud_tutorial_info": "",
            "draft_cloud_videocut_purchase_info": "",
            "draft_cover": "",
            "draft_deeplink_url": "",
            "draft_enterprise_info": {
                "draft_enterprise_extra": "",
                "draft_enterprise_id": "",
                "draft_enterprise_name": ""
            },
            "draft_fold_path": "",
            "draft_id": draftId,
            "draft_is_article_video_draft": false,
            "draft_is_from_deeplink": "false",
            "draft_materials": [
                { "type": 0, "value": materialsVideos.map(m => m.id) },
                { "type": 1, "value": [] },
                { "type": 2, "value": [] },
                { "type": 3, "value": [] },
                { "type": 6, "value": [] },
                { "type": 7, "value": [] },
                { "type": 8, "value": materialsAudios.map(m => m.id) }
            ],
            "draft_materials_copied_info": [],
            "draft_name": projectName,
            "draft_removable_storage_device": "",
            "draft_root_path": "",
            "draft_segment_extra_info": [],
            "draft_timeline_materials_size_": materialsVideos.length + materialsAudios.length,
            "tm_draft_cloud_completed": "",
            "tm_draft_cloud_modified": 0,
            "tm_draft_create": Date.now() * 1000,
            "tm_draft_modified": Date.now() * 1000,
            "tm_duration": currentMicroTime
        };

        const draftContent = {
            "canvas_config": {
                "height": 1920,
                "ratio": "original",
                "width": 1080
            },
            "color_space": -1,
            "config": {
                "adjust_max_index": 1,
                "attachment_info": [],
                "combination_max_index": 1,
                "export_range": null,
                "extract_audio_last_index": 1,
                "lyrics_recognition_id": "",
                "lyrics_sync": true,
                "lyrics_taskinfo": [],
                "maintrack_adsorb": true,
                "material_save_mode": 0,
                "multi_language_current": "none",
                "multi_language_list": [],
                "multi_language_main": "none",
                "multi_language_mode": "none",
                "original_sound_last_index": 1,
                "record_audio_last_index": 1,
                "sticker_max_index": 1,
                "subtitle_keywords_config": null,
                "subtitle_recognition_id": "",
                "subtitle_sync": true,
                "subtitle_taskinfo": [],
                "system_font_list": [],
                "video_mute": false,
                "zoom_info_params": null
            },
            "cover": null,
            "create_time": 0,
            "duration": currentMicroTime,
            "extra_info": null,
            "fps": 30,
            "free_render_index_mode_on": false,
            "group_container": null,
            "id": uuidv4(),
            "is_drop_frame_timecode": false,
            "keyframe_graph_list": [],
            "keyframes": {
                "adjusts": [],
                "audios": [],
                "effects": [],
                "filters": [],
                "handwrites": [],
                "stickers": [],
                "texts": [],
                "videos": []
            },
            "lyrics_effects": [],
            "materials": {
                "ai_translates": [],
                "audio_balances": [],
                "audio_effects": [],
                "audio_fades": [],
                "audio_track_indexes": [],
                "audios": materialsAudios.map(({ _sourcePath, ...rest }) => rest),
                "beats": [],
                "canvases": [],
                "chromas": [],
                "color_curves": [],
                "masks": [],
                "common_mask": [],
                "digital_humans": [],
                "drafts": [],
                "effects": [],
                "flowers": [],
                "green_screens": [],
                "handwrites": [],
                "hsl": [],
                "images": [],
                "log_color_wheels": [],
                "loudnesses": [],
                "manual_deformations": [],
                "material_animations": [],
                "material_colors": [],
                "multi_language_refs": [],
                "placeholder_infos": [],
                "placeholders": [],
                "plugin_effects": [],
                "primary_color_wheels": [],
                "realtime_denoises": [],
                "shapes": [],
                "smart_crops": [],
                "smart_relights": [],
                "sound_channel_mappings": [],
                "speeds": [],
                "stickers": [],
                "tail_leaders": [],
                "text_templates": [],
                "texts": [],
                "time_marks": [],
                "transitions": [],
                "video_effects": [],
                "video_trackings": [],
                "videos": materialsVideos.map(({ _sourcePath, ...rest }) => rest),
                "vocal_beautifys": [],
                "vocal_separations": []
            },
            "mutable_config": null,
            "name": projectName,
            "new_version": "110.0.0",
            "path": "",
            "relationships": [],
            "render_index_track_mode_on": true,
            "retouch_cover": null,
            "source": "default",
            "static_cover_image_path": "",
            "time_marks": null,
            "tracks": [
                {
                    "attribute": 0,
                    "flag": 0,
                    "id": uuidv4(),
                    "segments": videoSegments,
                    "type": "video"
                },
                {
                    "attribute": 0,
                    "flag": 0,
                    "id": uuidv4(),
                    "segments": audioSegments,
                    "type": "audio"
                }
            ],
            "update_time": 0,
            "version": 360000
        };

        // 设置下载 Headers
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(projectName)}_draft.zip"`);

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.on('error', function (err) {
            res.status(500).send({ error: err.message });
        });

        archive.pipe(res);

        // 打包 JSON
        archive.append(JSON.stringify(draftMetaInfo, null, 2), { name: 'draft_meta_info.json' });
        const draftContentStr = JSON.stringify(draftContent, null, 2);
        archive.append(draftContentStr, { name: 'draft_content.json' });
        archive.append(draftContentStr, { name: 'draft_info.json' });

        // 打包真实素材文件
        const mediaSet = new Set<string>();
        for (const mat of materialsVideos) {
            mediaSet.add(mat._sourcePath);
        }
        for (const mat of materialsAudios) {
            mediaSet.add(mat._sourcePath);
        }

        for (const absolutePath of mediaSet) {
            archive.file(absolutePath, { name: `draft_materials/${path.basename(absolutePath)}` });
        }

        await archive.finalize();
    } catch (e: any) {
        if (!res.headersSent) {
            res.status(500).send(e.message);
        }
    }
});
