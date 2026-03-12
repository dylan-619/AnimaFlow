import db from '../db/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Router, Request, Response } from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../../uploads');

export const qualityRouter = Router();

/**
 * 质量评估服务
 */
export class QualityAssessmentService {
    
    /**
     * 评估分镜图质量
     */
    async assessStoryboardImage(storyboardId: number, imagePath?: string) {
        const shot = await db('t_storyboard').where('id', storyboardId).first();
        if (!shot) {
            throw new Error('分镜不存在');
        }

        const project = await db('t_project').where('id', shot.projectId).first();
        
        // 如果没有提供图片路径，使用分镜记录中的路径
        const filePath = imagePath || (shot.filePath ? path.join(uploadsDir, shot.filePath) : null);
        
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error('图片文件不存在');
        }

        console.log(`[质量评估] 开始评估分镜 ${storyboardId}`);

        const scores = {
            clarity: await this.assessClarity(filePath),
            consistency: await this.assessConsistency(filePath, project.id),
            aesthetics: await this.assessAesthetics(filePath),
            promptAdherence: await this.assessPromptAdherence(filePath, shot.shotPrompt),
        };

        const overallScore = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
        const needsReview = overallScore < 6.5 || scores.consistency < 6;
        const recommendations = this.generateRecommendations(scores);

        // 保存评分
        await db('t_quality_score').insert({
            storyboardId,
            projectId: project.id,
            modelName: 'auto-assessment',
            clarity: scores.clarity,
            consistency: scores.consistency,
            aesthetics: scores.aesthetics,
            promptAdherence: scores.promptAdherence,
            overallScore,
            needsReview,
            recommendations: JSON.stringify(recommendations),
            createdAt: Date.now(),
        });

        console.log(`[质量评估] 分镜 ${storyboardId} 评分: ${overallScore.toFixed(2)}, 需审核: ${needsReview}`);

        return {
            storyboardId,
            segmentIndex: shot.segmentIndex,
            shotIndex: shot.shotIndex,
            scores,
            overallScore,
            needsReview,
            recommendations,
        };
    }

    /**
     * 清晰度评估
     */
    private async assessClarity(imagePath: string): Promise<number> {
        try {
            const stats = fs.statSync(imagePath);
            const fileSizeKB = stats.size / 1024;

            // 文件大小评分（基于经验值）
            // < 100KB: 3分, 100-300KB: 6分, 300-500KB: 8分, > 500KB: 10分
            if (fileSizeKB < 100) return 3;
            if (fileSizeKB < 300) return 6;
            if (fileSizeKB < 500) return 8;
            return 10;
        } catch (error) {
            return 5; // 默认中等分
        }
    }

    /**
     * 一致性评估
     */
    private async assessConsistency(imagePath: string, projectId: number): Promise<number> {
        try {
            // 检查是否使用了参考图
            const assets = await db('t_assets')
                .where('projectId', projectId)
                .whereNotNull('publicUrl');

            if (assets.length === 0) {
                return 7; // 无参考图，默认中等分
            }

            // 基于资产数量和类型评估
            const roleAssets = assets.filter((a: any) => a.type === 'role');
            const sceneAssets = assets.filter((a: any) => a.type === 'scene');

            // 角色资产越多，一致性应该越好
            let score = 6; // 基础分
            
            if (roleAssets.length > 0) score += 1.5;
            if (sceneAssets.length > 0) score += 1;
            if (roleAssets.length >= 2) score += 0.5;
            if (assets.length >= 5) score += 1;

            return Math.min(score, 10);
        } catch (error) {
            return 6;
        }
    }

    /**
     * 美观度评估
     */
    private async assessAesthetics(imagePath: string): Promise<number> {
        // 这里可以集成美学评估模型或API
        // 简化版本：基于文件特征估算
        try {
            const stats = fs.statSync(imagePath);
            const fileSizeMB = stats.size / (1024 * 1024);

            // 文件大小在合理范围内（0.5-3MB）通常质量较好
            if (fileSizeMB >= 0.5 && fileSizeMB <= 3) {
                return 8;
            } else if (fileSizeMB < 0.5) {
                return 6;
            } else {
                return 7;
            }
        } catch (error) {
            return 7;
        }
    }

    /**
     * 提示词遵循度评估
     */
    private async assessPromptAdherence(imagePath: string, prompt: string): Promise<number> {
        if (!prompt) return 7;

        // 基于提示词长度和结构评估
        const promptLength = prompt.length;
        const hasKeywords = ['景', '光', '色', '构图', '角度'].some(k => prompt.includes(k));

        let score = 6;

        // 提示词长度适中（100-300字符）且包含关键要素
        if (promptLength >= 100 && promptLength <= 300) {
            score += 1;
        }
        
        if (hasKeywords) {
            score += 1;
        }

        // 提示词过长可能导致模型忽略细节
        if (promptLength > 400) {
            score -= 1;
        }

        return Math.min(Math.max(score, 1), 10);
    }

    /**
     * 生成改进建议
     */
    private generateRecommendations(scores: any): string[] {
        const recommendations: string[] = [];

        if (scores.clarity < 6) {
            recommendations.push('建议：提高图像分辨率或优化压缩设置，确保图像文件大小在300KB以上');
        }

        if (scores.consistency < 6) {
            recommendations.push('建议：增强角色资产参考图权重（0.8），确保人物一致性；检查参考图是否清晰');
        }

        if (scores.aesthetics < 6) {
            recommendations.push('建议：优化提示词中的构图和光影描述，使用专业摄影术语');
        }

        if (scores.promptAdherence < 6) {
            recommendations.push('建议：简化提示词至100-300字符，突出关键视觉元素；避免过长描述');
        }

        if (recommendations.length === 0) {
            recommendations.push('质量良好，无需特别优化');
        }

        return recommendations;
    }

    /**
     * 批量质量评估
     */
    async batchAssess(projectId: number) {
        console.log(`[批量评估] 项目 ${projectId}`);

        const shots = await db('t_storyboard')
            .where('projectId', projectId)
            .whereNotNull('filePath')
            .orderBy('segmentIndex')
            .orderBy('shotIndex');

        if (shots.length === 0) {
            return {
                message: '没有可评估的分镜',
                totalAssessed: 0,
            };
        }

        const results: any[] = [];

        for (let i = 0; i < shots.length; i++) {
            const shot = shots[i];
            console.log(`[批量评估] 进度 ${i + 1}/${shots.length} - S${shot.segmentIndex}-${shot.shotIndex}`);

            try {
                const assessment = await this.assessStoryboardImage(shot.id);
                results.push(assessment);
            } catch (err: any) {
                console.error(`[批量评估] 分镜 ${shot.id} 评估失败:`, err.message);
                results.push({
                    storyboardId: shot.id,
                    error: err.message,
                });
            }
        }

        // 计算项目整体质量
        const validResults = results.filter(r => !r.error);
        const avgScore = validResults.length > 0
            ? validResults.reduce((sum, r) => sum + r.overallScore, 0) / validResults.length
            : 0;
        const needsReviewCount = validResults.filter(r => r.needsReview).length;

        console.log(`[批量评估] 完成: 平均分 ${avgScore.toFixed(2)}, 需审核 ${needsReviewCount}/${validResults.length}`);

        return {
            totalAssessed: validResults.length,
            failed: results.filter(r => r.error).length,
            averageScore: avgScore.toFixed(2),
            needsReviewCount,
            needsReviewRate: validResults.length > 0 
                ? (needsReviewCount / validResults.length * 100).toFixed(1) + '%' 
                : '0%',
            details: results,
        };
    }

    /**
     * 获取质量统计
     */
    async getQualityStats(projectId: number) {
        const scores = await db('t_quality_score')
            .where('projectId', projectId)
            .orderBy('createdAt', 'desc');

        if (scores.length === 0) {
            return {
                message: '暂无质量评分数据',
                totalScores: 0,
            };
        }

        const avgOverall = scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
        const avgClarity = scores.reduce((sum, s) => sum + s.clarity, 0) / scores.length;
        const avgConsistency = scores.reduce((sum, s) => sum + s.consistency, 0) / scores.length;
        const avgAesthetics = scores.reduce((sum, s) => sum + s.aesthetics, 0) / scores.length;
        const avgPromptAdherence = scores.reduce((sum, s) => sum + s.promptAdherence, 0) / scores.length;

        const needsReview = scores.filter(s => s.needsReview).length;

        return {
            totalScores: scores.length,
            averageScore: avgOverall.toFixed(2),
            dimensions: {
                clarity: avgClarity.toFixed(2),
                consistency: avgConsistency.toFixed(2),
                aesthetics: avgAesthetics.toFixed(2),
                promptAdherence: avgPromptAdherence.toFixed(2),
            },
            needsReview,
            needsReviewRate: (needsReview / scores.length * 100).toFixed(1) + '%',
            recentScores: scores.slice(0, 10),
        };
    }

    /**
     * 提交用户评分
     */
    async submitUserScore(
        storyboardId: number,
        scores: { clarity: number; consistency: number; aesthetics: number; promptAdherence: number },
        feedback?: string
    ) {
        const overallScore = (scores.clarity + scores.consistency + scores.aesthetics + scores.promptAdherence) / 4;
        const needsReview = overallScore < 6.5;

        const [inserted] = await db('t_quality_score').insert({
            storyboardId,
            modelName: 'user-assessment',
            clarity: scores.clarity,
            consistency: scores.consistency,
            aesthetics: scores.aesthetics,
            promptAdherence: scores.promptAdherence,
            overallScore,
            feedback,
            needsReview,
            createdAt: Date.now(),
        }).returning('id');

        console.log(`[用户评分] 分镜 ${storyboardId}: ${overallScore.toFixed(2)}`);

        return {
            id: inserted.id || inserted,
            overallScore,
            needsReview,
        };
    }
}

// ==================== 路由接口 ====================

const qualityService = new QualityAssessmentService();

// 评估单个分镜
qualityRouter.post('/api/quality/assess', async (req: Request, res: Response) => {
    try {
        const { storyboardId, imagePath } = req.body;
        const result = await qualityService.assessStoryboardImage(storyboardId, imagePath);
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[质量评估] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 批量评估
qualityRouter.post('/api/quality/batchAssess', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.body;
        const result = await qualityService.batchAssess(projectId);
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[批量评估] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 获取质量统计
qualityRouter.get('/api/quality/stats/:projectId', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const stats = await qualityService.getQualityStats(parseInt(projectId));
        res.json({ code: 0, data: stats });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 提交用户评分
qualityRouter.post('/api/quality/userScore', async (req: Request, res: Response) => {
    try {
        const { storyboardId, scores, feedback } = req.body;
        const result = await qualityService.submitUserScore(storyboardId, scores, feedback);
        res.json({ code: 0, data: result });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});
