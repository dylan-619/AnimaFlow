// 注册所有任务 handler
// 各 service 文件需要在此处统一注册

import { registerTaskHandler } from './taskRunner.js';

// 动态导入各 service 的 handler
export async function registerAllHandlers() {
    const { storylineHandler } = await import('../services/storylineService.js');
    const { outlineHandler } = await import('../services/outlineService.js');
    const { assetsExtractHandler, assetImageHandler } = await import('../services/assetsService.js');
    const { scriptHandler } = await import('../services/scriptService.js');
    const { storyboardHandler, storyboardImageHandler, storyboardTTSHandler } = await import('../services/storyboardService.js');
    const { videoHandler, batchVideoHandler } = await import('../services/videoService.js');
    const { compositeHandler } = await import('../services/compositeService.js');

    registerTaskHandler('storyline', storylineHandler);
    registerTaskHandler('outline', outlineHandler);
    registerTaskHandler('assets_extract', assetsExtractHandler);
    registerTaskHandler('asset_image', assetImageHandler);
    registerTaskHandler('script', scriptHandler);
    registerTaskHandler('storyboard', storyboardHandler);
    registerTaskHandler('storyboard_image', storyboardImageHandler);
    registerTaskHandler('storyboard_tts', storyboardTTSHandler);
    registerTaskHandler('video', videoHandler);
    registerTaskHandler('video_generate', batchVideoHandler); // 🔴 新增：批量视频生成
    registerTaskHandler('composite', compositeHandler);
}
