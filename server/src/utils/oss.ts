import OSSModule from 'ali-oss';
import db from '../db/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ali-oss 是 CJS 包，ESM 导入时可能需要处理 default 嵌套
const OSS = (OSSModule as any).default || OSSModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');

/**
 * 从数据库读取 OSS 配置并创建客户端
 * 如果未配置则返回 null
 */
export async function getOSSClient(): Promise<InstanceType<typeof OSS> | null> {
    const setting = await db('t_setting').where('userId', 1).first();
    if (!setting?.ossAccessKeyId || !setting?.ossAccessKeySecret || !setting?.ossBucket || !setting?.ossRegion) {
        console.log('[OSS] 未配置 OSS，跳过上传');
        return null;
    }
    console.log(`[OSS] 创建客户端: region=${setting.ossRegion}, bucket=${setting.ossBucket}`);
    return new OSS({
        region: setting.ossRegion,
        accessKeyId: setting.ossAccessKeyId,
        accessKeySecret: setting.ossAccessKeySecret,
        bucket: setting.ossBucket,
    });
}

/**
 * 上传本地文件到 OSS
 * @param localFileName uploads 目录下的文件名
 * @param ossDir OSS 中的目录前缀（如 'assets'、'storyboard'）
 * @returns 公网访问 URL，如果 OSS 未配置则返回 null
 */
export async function uploadToOSS(localFileName: string, ossDir: string = 'images'): Promise<string | null> {
    const client = await getOSSClient();
    if (!client) return null;

    const localPath = path.join(uploadsDir, localFileName);
    if (!fs.existsSync(localPath)) {
        console.warn(`[OSS] 本地文件不存在: ${localPath}`);
        return null;
    }

    const ossKey = `${ossDir}/${localFileName}`;
    try {
        console.log(`[OSS] 开始上传: ${localPath} → ${ossKey}`);
        const result = await client.put(ossKey, localPath);
        console.log(`[OSS] 上传成功: ${result.url}`);

        // 读取自定义域名配置
        const setting = await db('t_setting').where('userId', 1).first();
        if (setting?.ossCustomDomain) {
            const customUrl = `${setting.ossCustomDomain.replace(/\/+$/, '')}/${ossKey}`;
            console.log(`[OSS] 使用自定义域名: ${customUrl}`);
            return customUrl;
        }
        return result.url;
    } catch (e: any) {
        console.error(`[OSS] 上传失败: ${localFileName}`, e?.message || e);
        return null;
    }
}
