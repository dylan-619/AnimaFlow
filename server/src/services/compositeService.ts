import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import db from '../db/index.js';
import { Task } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

/**
 * 获取媒体文件时长（秒）
 */
function getMediaDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format.duration || 0);
        });
    });
}

/**
 * 转义 ffmpeg drawtext 的特殊字符
 */
function escapeDrawText(text: string): string {
    return text
        .replace(/\\/g, '\\\\\\\\')
        .replace(/'/g, "'\\\\\\''")
        .replace(/:/g, '\\:')
        .replace(/%/g, '%%')
        .replace(/\n/g, '');
}

/**
 * 将单个视频与音频合并
 * 策略：
 *   - 音频比视频长 → 冻结视频最后一帧延长画面，保留完整台词
 *   - 音频比视频短 → 音频播完后视频继续（静音）
 *   - 无音频 → 添加静音音轨（确保 concat 格式统一）
 */
async function mergeVideoAudio(videoPath: string, audioPath: string | null, outputPath: string): Promise<void> {
    if (audioPath && fs.existsSync(audioPath)) {
        const videoDuration = await getMediaDuration(videoPath);
        const audioDuration = await getMediaDuration(audioPath);
        console.log(`[合成] 视频: ${videoDuration.toFixed(1)}s, 音频: ${audioDuration.toFixed(1)}s`);

        if (audioDuration > videoDuration + 0.5) {
            // 音频更长：用 tpad 冻结最后一帧延长视频，确保完整台词
            const padDuration = Math.ceil(audioDuration - videoDuration) + 1;
            console.log(`[合成] 音频比视频长 ${(audioDuration - videoDuration).toFixed(1)}s，冻结末帧延长画面`);
            await new Promise<void>((resolve, reject) => {
                ffmpeg()
                    .input(videoPath)
                    .input(audioPath)
                    .complexFilter([
                        `[0:v]tpad=stop_duration=${padDuration}:stop_mode=clone[v]`
                    ])
                    .outputOptions([
                        '-map', '[v]',
                        '-map', '1:a',
                        '-c:v', 'libx264',
                        '-preset', 'fast',
                        '-crf', '23',
                        '-c:a', 'aac',
                        '-b:a', '128k',
                        '-shortest',
                        '-movflags', '+faststart'
                    ])
                    .output(outputPath)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(new Error(`音画合并失败: ${err.message}`)))
                    .run();
            });
        } else {
            // 视频更长或差不多：直接合并，视频长度为准
            await new Promise<void>((resolve, reject) => {
                ffmpeg()
                    .input(videoPath)
                    .input(audioPath)
                    .outputOptions([
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-b:a', '128k',
                        '-map', '0:v',
                        '-map', '1:a',
                        '-shortest',
                        '-movflags', '+faststart'
                    ])
                    .output(outputPath)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(new Error(`音画合并失败: ${err.message}`)))
                    .run();
            });
        }
    } else {
        // 无音频：添加静音音轨，确保所有片段格式统一便于 concat
        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(videoPath)
                .inputOptions(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'])
                .outputOptions([
                    '-c:v', 'copy',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-map', '0:v',
                    '-map', '1:a',
                    '-shortest',
                    '-movflags', '+faststart'
                ])
                .output(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`添加静音轨失败: ${err.message}`)))
                .run();
        });
    }
}

/**
 * 为视频烧录字幕
 */
async function burnSubtitle(
    videoPath: string,
    subtitleText: string,
    outputPath: string,
    style: { fontSize?: number; fontColor?: string; bgColor?: string }
): Promise<void> {
    if (!subtitleText || !subtitleText.trim()) {
        // 无字幕文本，直接拷贝
        fs.copyFileSync(videoPath, outputPath);
        return;
    }

    const fontSize = style.fontSize || 28;
    const fontColor = style.fontColor || 'white';
    const bgColor = style.bgColor || 'black@0.5';
    const escapedText = escapeDrawText(subtitleText.trim());
    const boxHeight = fontSize * 2.5;

    // 使用 drawtext 在底部居中显示字幕，带半透明黑色背景条
    const filter = [
        `drawbox=y=ih-${boxHeight}:w=iw:h=${boxHeight}:color=${bgColor}:t=fill`,
        `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=h-${fontSize * 1.8}:font=Noto Sans CJK SC`
    ].join(',');

    await new Promise<void>((resolve, reject) => {
        ffmpeg()
            .input(videoPath)
            .videoFilters(filter)
            .outputOptions([
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-c:a', 'copy',
                '-movflags', '+faststart'
            ])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`字幕烧录失败: ${err.message}`)))
            .run();
    });
}

/**
 * 为成片混入 BGM
 */
async function mixBGM(
    videoPath: string,
    bgmPath: string,
    bgmVolume: number,
    outputPath: string
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        ffmpeg()
            .input(videoPath)
            .input(bgmPath)
            .complexFilter([
                `[1:a]aloop=loop=-1:size=2e+09,volume=${bgmVolume}[bgm]`,
                `[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[out]`
            ])
            .outputOptions([
                '-map', '0:v',
                '-map', '[out]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart'
            ])
            .output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(new Error(`BGM 混音失败: ${err.message}`)))
            .run();
    });
}

/**
 * 视频合成为成片（含音画合并 + 字幕烧录 + BGM 混音）
 */
export async function compositeHandler(task: Task, updateProgress: (p: number) => Promise<void>) {
    const { scriptId } = JSON.parse(task.input || '{}');
    if (!scriptId) throw new Error('缺少 scriptId参数');

    console.log(`[合成] 开始合成剧本 ID: ${scriptId}`);
    await updateProgress(5);

    // 获取剧本配置（字幕、BGM等）
    const script = await db('t_script').where('id', scriptId).first();
    const subtitleEnabled = script?.subtitleEnabled !== 0; // 默认开启
    let subtitleStyle: { fontSize?: number; fontColor?: string; bgColor?: string } = {};
    try { subtitleStyle = JSON.parse(script?.subtitleStyle || '{}'); } catch (e) { /* ignore */ }

    const bgmPath = script?.bgmPath ? path.join(UPLOADS_DIR, script.bgmPath) : null;
    const bgmVolume = script?.bgmVolume ?? 0.3;

    // 1. 获取所有分镜
    const shots = await db('t_storyboard').where('scriptId', scriptId).orderBy(['segmentIndex', 'shotIndex']);
    if (shots.length === 0) throw new Error('该剧本没有分镜');

    // 2. 收集每个分镜的视频和音频
    const segments: { videoPath: string; audioPath: string | null; dubbingText: string; label: string }[] = [];

    for (const shot of shots) {
        const configs = await db('t_videoConfig').where('storyboardId', shot.id).select('id', 'selectedResultId');
        const configIds = configs.map((c: any) => c.id);

        if (configIds.length === 0) {
            throw new Error(`分镜 S${shot.segmentIndex}-${shot.shotIndex} 还没有开始视频生成任务`);
        }

        // 优先使用用户选择的视频
        const selectedId = configs.find((c: any) => c.selectedResultId)?.selectedResultId;
        let finalVideo: any = null;

        if (selectedId) {
            finalVideo = await db('t_video').where('id', selectedId).where('state', 1).first();
        }

        // Fallback: 取最新成功的视频
        if (!finalVideo) {
            finalVideo = await db('t_video')
                .whereIn('configId', configIds)
                .where('state', 1)
                .whereNotNull('filePath')
                .orderBy('createTime', 'desc')
                .first();
        }

        if (!finalVideo?.filePath) {
            throw new Error(`分镜 S${shot.segmentIndex}-${shot.shotIndex} 还没有成功生成的视频，请先生成所有视频`);
        }

        const fullVideoPath = path.join(UPLOADS_DIR, finalVideo.filePath);
        if (!fs.existsSync(fullVideoPath)) {
            throw new Error(`分镜 S${shot.segmentIndex}-${shot.shotIndex} 视频文件不存在: ${finalVideo.filePath}`);
        }

        const audioFullPath = shot.audioPath ? path.join(UPLOADS_DIR, shot.audioPath) : null;

        segments.push({
            videoPath: fullVideoPath,
            audioPath: audioFullPath,
            dubbingText: shot.dubbingText || '',
            label: `S${shot.segmentIndex}-${shot.shotIndex}`
        });
    }

    if (segments.length === 0) {
        throw new Error('没有可用来合成的视频文件');
    }

    await updateProgress(10);

    // 3. 确保输出目录
    const compositeDir = path.join(UPLOADS_DIR, 'composite');
    if (!fs.existsSync(compositeDir)) {
        fs.mkdirSync(compositeDir, { recursive: true });
    }

    // 4. Stage 1 — 逐镜头音画合并
    const mergedFiles: string[] = [];
    const tempFiles: string[] = [];

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const mergedFileName = path.join(compositeDir, `_temp_${scriptId}_${i}_${Date.now()}.mp4`);

        console.log(`[合成] [${i + 1}/${segments.length}] ${seg.label} — ${seg.audioPath ? '有配音' : '无配音'}`);

        try {
            await mergeVideoAudio(seg.videoPath, seg.audioPath, mergedFileName);
            mergedFiles.push(mergedFileName);
            tempFiles.push(mergedFileName);
        } catch (err: any) {
            console.error(`[合成] ${seg.label} 音画合并失败:`, err.message);
            // 降级：直接使用原视频
            mergedFiles.push(seg.videoPath);
        }

        await updateProgress(10 + Math.round(((i + 1) / segments.length) * 30));
    }

    // 5. Stage 2 — 字幕烧录（如果开启）
    const subtitledFiles: string[] = [];
    if (subtitleEnabled) {
        console.log(`[合成] Stage 2: 烧录字幕...`);
        for (let i = 0; i < mergedFiles.length; i++) {
            const seg = segments[i];
            if (seg.dubbingText?.trim()) {
                const subtitledFile = path.join(compositeDir, `_sub_${scriptId}_${i}_${Date.now()}.mp4`);
                try {
                    await burnSubtitle(mergedFiles[i], seg.dubbingText, subtitledFile, subtitleStyle);
                    subtitledFiles.push(subtitledFile);
                    tempFiles.push(subtitledFile);
                    console.log(`[合成] ${seg.label} 字幕烧录完成`);
                } catch (err: any) {
                    console.error(`[合成] ${seg.label} 字幕烧录失败:`, err.message);
                    subtitledFiles.push(mergedFiles[i]); // 降级使用无字幕版本
                }
            } else {
                subtitledFiles.push(mergedFiles[i]);
            }
            await updateProgress(40 + Math.round(((i + 1) / mergedFiles.length) * 20));
        }
    } else {
        subtitledFiles.push(...mergedFiles);
    }

    // 6. Stage 3 — 全部拼接
    const concatFileName = `composite_${scriptId}_${Date.now()}.mp4`;
    const concatOutputPath = path.join(compositeDir, concatFileName);

    // 生成 concat list
    const listFileName = path.join(compositeDir, `concat_${scriptId}_${Date.now()}.txt`);
    const fileContent = subtitledFiles.map(vf => `file '${vf}'`).join('\n');
    fs.writeFileSync(listFileName, fileContent, 'utf-8');

    console.log(`[合成] Stage 3: 拼接 ${subtitledFiles.length} 个片段...`);

    await new Promise<void>((resolve, reject) => {
        ffmpeg()
            .input(listFileName)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions(['-c copy', '-movflags', '+faststart'])
            .save(concatOutputPath)
            .on('start', (cmd) => console.log(`[合成] ffmpeg: ${cmd}`))
            .on('end', () => {
                console.log('[合成] 成片拼接完成！');
                resolve();
            })
            .on('error', (err, _stdout, stderr) => {
                console.error('[合成] ffmpeg 错误:', err.message);
                console.error('[合成] stderr:', stderr);
                reject(new Error('ffmpeg 拼接失败: ' + err.message));
            });
    });

    await updateProgress(80);

    // 7. Stage 4 — BGM 混音（如果有）
    let finalOutputPath = concatOutputPath;
    let finalFileName = concatFileName;

    if (bgmPath && fs.existsSync(bgmPath)) {
        console.log(`[合成] Stage 4: 混入 BGM (音量: ${bgmVolume})...`);
        finalFileName = `final_${scriptId}_${Date.now()}.mp4`;
        finalOutputPath = path.join(compositeDir, finalFileName);
        try {
            await mixBGM(concatOutputPath, bgmPath, bgmVolume, finalOutputPath);
            tempFiles.push(concatOutputPath); // 拼接中间产物变为临时文件
            console.log('[合成] BGM 混音完成');
        } catch (err: any) {
            console.error('[合成] BGM 混音失败:', err.message);
            // 降级使用无BGM版本
            finalOutputPath = concatOutputPath;
            finalFileName = concatFileName;
        }
    }

    await updateProgress(90);

    // 8. 清理临时文件
    if (fs.existsSync(listFileName)) fs.unlinkSync(listFileName);
    for (const tf of tempFiles) {
        if (fs.existsSync(tf)) {
            try { fs.unlinkSync(tf); } catch (e) { /* ignore */ }
        }
    }

    await updateProgress(95);

    // 9. 保存结果
    const relativePath = `composite/${finalFileName}`;
    await db('t_script').where('id', scriptId).update({ compositeVideo: relativePath });

    await updateProgress(100);
    console.log(`[合成] ✅ 成片已生成: ${relativePath}`);

    return { filePath: relativePath };
}
