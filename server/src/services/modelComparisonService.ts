import db from '../db/index.js';
import { imageGenerate } from '../ai/image.js';
import { Router, Request, Response } from 'express';

export const modelComparisonRouter = Router();

/**
 * 模型对比测试服务
 */
export class ModelComparisonService {
    
    /**
     * 多模型对比测试
     */
    async compareModels(
        storyboardId: number,
        modelNames: string[],
        generateCount: number = 2
    ) {
        console.log(`[模型对比] 分镜 ${storyboardId}, 模型 ${modelNames.join(',')}, 每模型生成 ${generateCount} 张`);

        const shot = await db('t_storyboard').where('id', storyboardId).first();
        if (!shot) {
            throw new Error('分镜不存在');
        }

        const project = await db('t_project').where('id', shot.projectId).first();
        const results: any[] = [];

        // 遍历每个模型生成图片
        for (const modelName of modelNames) {
            console.log(`[模型对比] 测试模型: ${modelName}`);

            for (let i = 0; i < generateCount; i++) {
                try {
                    const startTime = Date.now();

                    // 使用指定模型生成
                    const images = await imageGenerate(shot.shotPrompt, {
                        model: modelName,
                        prefix: `compare_${modelName.replace(/[^a-zA-Z0-9]/g, '_')}_${i}`,
                        width: 1280,
                        height: 720,
                    });

                    const duration = Date.now() - startTime;

                    results.push({
                        modelName,
                        imageIndex: i,
                        fileName: images[0]?.fileName,
                        publicUrl: images[0]?.publicUrl,
                        duration,
                        success: true,
                    });

                    // 记录到数据库
                    await this.recordComparison(project.id, 'storyboard_image', modelName, {
                        duration,
                        success: true,
                    });

                    console.log(`[模型对比] ${modelName} 第 ${i + 1} 张生成成功，耗时 ${duration}ms`);

                } catch (err: any) {
                    console.error(`[模型对比] ${modelName} 第 ${i + 1} 张生成失败:`, err.message);

                    results.push({
                        modelName,
                        imageIndex: i,
                        success: false,
                        error: err.message,
                    });

                    // 记录失败
                    await this.recordComparison(project.id, 'storyboard_image', modelName, {
                        success: false,
                        error: err.message,
                    });
                }
            }
        }

        console.log(`[模型对比] 完成，成功 ${results.filter(r => r.success).length}/${results.length} 张`);

        return {
            storyboardId,
            totalGenerated: results.filter(r => r.success).length,
            results,
        };
    }

    /**
     * 记录模型对比数据
     */
    private async recordComparison(
        projectId: number,
        taskType: string,
        modelName: string,
        stats: { duration?: number; success: boolean; error?: string }
    ) {
        // 查找现有记录
        let record = await db('t_model_comparison')
            .where('projectId', projectId)
            .where('taskType', taskType)
            .where('modelName', modelName)
            .first();

        const now = Date.now();

        if (record) {
            // 更新统计
            const successCount = stats.success ? (record.successCount || 0) + 1 : record.successCount;
            const failCount = !stats.success ? (record.failCount || 0) + 1 : record.failCount;
            const totalDuration = (record.avgDuration || 0) * (record.successCount || 0) + (stats.duration || 0);

            await db('t_model_comparison')
                .where('id', record.id)
                .update({
                    successCount,
                    failCount,
                    avgDuration: successCount > 0 ? totalDuration / successCount : 0,
                    updatedAt: now,
                });
        } else {
            // 创建新记录
            await db('t_model_comparison').insert({
                projectId,
                taskType,
                modelName,
                enabled: true,
                successCount: stats.success ? 1 : 0,
                failCount: stats.success ? 0 : 1,
                avgDuration: stats.duration || 0,
                createdAt: now,
                updatedAt: now,
            });
        }
    }

    /**
     * 获取模型性能统计
     */
    async getModelStats(projectId: number, taskType?: string) {
        let query = db('t_model_comparison')
            .where('projectId', projectId);

        if (taskType) {
            query = query.where('taskType', taskType);
        }

        const stats = await query.orderBy('modelName');

        // 获取质量评分统计
        const qualityQuery = db('t_quality_score')
            .join('t_storyboard', 't_quality_score.storyboardId', 't_storyboard.id')
            .where('t_storyboard.projectId', projectId);

        const qualityStats = await qualityQuery
            .groupBy('t_quality_score.modelName')
            .select('t_quality_score.modelName')
            .avg('t_quality_score.overallScore as avgQuality')
            .avg('t_quality_score.consistency as avgConsistency')
            .avg('t_quality_score.clarity as avgClarity')
            .count('* as totalScores');

        // 合并性能和质量数据
        const mergedStats = stats.map((stat: any) => {
            const quality = qualityStats.find((q: any) => q.modelName === stat.modelName);
            const totalRuns = (stat.successCount || 0) + (stat.failCount || 0);
            const successRate = totalRuns > 0 ? ((stat.successCount || 0) / totalRuns * 100).toFixed(1) : '0';

            return {
                modelName: stat.modelName,
                taskType: stat.taskType,
                totalRuns,
                successCount: stat.successCount || 0,
                failCount: stat.failCount || 0,
                successRate: successRate + '%',
                avgDuration: stat.avgDuration ? (stat.avgDuration / 1000).toFixed(2) + 's' : 'N/A',
                avgQuality: quality?.avgQuality ? Number(quality.avgQuality).toFixed(2) : 'N/A',
                avgConsistency: quality?.avgConsistency ? Number(quality.avgConsistency).toFixed(2) : 'N/A',
                enabled: stat.enabled,
            };
        });

        return {
            stats: mergedStats,
            recommendation: this.generateRecommendation(mergedStats),
        };
    }

    /**
     * 生成模型推荐
     */
    private generateRecommendation(stats: any[]): string {
        if (stats.length === 0) {
            return '暂无数据，无法推荐';
        }

        // 综合评分：成功率 40% + 质量 40% + 速度 20%
        const scores = stats.map(stat => {
            const successRateScore = parseFloat(stat.successRate) || 0;
            const qualityScore = parseFloat(stat.avgQuality) * 10 || 50;
            const speedScore = stat.avgDuration !== 'N/A' 
                ? Math.max(0, 100 - parseFloat(stat.avgDuration) * 2) 
                : 50;

            return {
                modelName: stat.modelName,
                score: successRateScore * 0.4 + qualityScore * 0.4 + speedScore * 0.2,
            };
        });

        scores.sort((a, b) => b.score - a.score);

        return scores[0]?.modelName || 'doubao-seedream-4-0';
    }

    /**
     * 更新模型优先级
     */
    async updateModelPriority(projectId: number, modelName: string, priority: number) {
        await db('t_model_comparison')
            .where('projectId', projectId)
            .where('modelName', modelName)
            .update({ priority, updatedAt: Date.now() });

        console.log(`[模型优先级] ${modelName} 设置为 ${priority}`);
    }

    /**
     * 启用/禁用模型
     */
    async toggleModel(projectId: number, modelName: string, enabled: boolean) {
        await db('t_model_comparison')
            .where('projectId', projectId)
            .where('modelName', modelName)
            .update({ enabled, updatedAt: Date.now() });

        console.log(`[模型切换] ${modelName} ${enabled ? '启用' : '禁用'}`);
    }

    /**
     * 获取推荐模型
     */
    async getRecommendedModel(projectId: number, taskType: string = 'storyboard_image'): Promise<string> {
        const stats = await db('t_model_comparison')
            .where('projectId', projectId)
            .where('taskType', taskType)
            .where('enabled', true)
            .orderBy('priority', 'asc')
            .first();

        return stats?.modelName || 'doubao-seedream-4-0';
    }

    /**
     * 批量测试多个分镜
     */
    async batchCompare(
        projectId: number,
        storyboardIds: number[],
        modelNames: string[],
        generateCount: number = 1
    ) {
        console.log(`[批量对比] 项目 ${projectId}, ${storyboardIds.length} 个分镜, ${modelNames.length} 个模型`);

        const results: any[] = [];

        for (const storyboardId of storyboardIds) {
            try {
                const result = await this.compareModels(storyboardId, modelNames, generateCount);
                results.push(result);
            } catch (err: any) {
                console.error(`[批量对比] 分镜 ${storyboardId} 失败:`, err.message);
            }
        }

        // 汇总统计
        const summary = {
            totalStoryboards: storyboardIds.length,
            totalImages: results.reduce((sum, r) => sum + r.totalGenerated, 0),
            modelStats: {} as Record<string, { success: number; fail: number; avgDuration: number }>,
        };

        for (const result of results) {
            for (const r of result.results) {
                if (!summary.modelStats[r.modelName]) {
                    summary.modelStats[r.modelName] = { success: 0, fail: 0, avgDuration: 0 };
                }
                if (r.success) {
                    summary.modelStats[r.modelName].success++;
                    summary.modelStats[r.modelName].avgDuration += r.duration;
                } else {
                    summary.modelStats[r.modelName].fail++;
                }
            }
        }

        // 计算平均时长
        for (const modelName of Object.keys(summary.modelStats)) {
            const stat = summary.modelStats[modelName];
            if (stat.success > 0) {
                stat.avgDuration = stat.avgDuration / stat.success;
            }
        }

        console.log(`[批量对比] 完成，共生成 ${summary.totalImages} 张图片`);

        return {
            summary,
            details: results,
        };
    }
}

// ==================== 路由接口 ====================

const modelService = new ModelComparisonService();

// 多模型对比测试
modelComparisonRouter.post('/api/model/compare', async (req: Request, res: Response) => {
    try {
        const { storyboardId, models, generateCount } = req.body;
        const result = await modelService.compareModels(storyboardId, models, generateCount);
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[模型对比] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 批量对比测试
modelComparisonRouter.post('/api/model/batchCompare', async (req: Request, res: Response) => {
    try {
        const { projectId, storyboardIds, models, generateCount } = req.body;
        const result = await modelService.batchCompare(projectId, storyboardIds, models, generateCount);
        res.json({ code: 0, data: result });
    } catch (err: any) {
        console.error('[批量对比] 错误:', err);
        res.json({ code: -1, msg: err.message });
    }
});

// 获取模型统计
modelComparisonRouter.get('/api/model/stats/:projectId', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const { taskType } = req.query;
        const stats = await modelService.getModelStats(parseInt(projectId), taskType as string);
        res.json({ code: 0, data: stats });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 更新模型优先级
modelComparisonRouter.post('/api/model/priority', async (req: Request, res: Response) => {
    try {
        const { projectId, modelName, priority } = req.body;
        await modelService.updateModelPriority(projectId, modelName, priority);
        res.json({ code: 0, data: { modelName, priority } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 启用/禁用模型
modelComparisonRouter.post('/api/model/toggle', async (req: Request, res: Response) => {
    try {
        const { projectId, modelName, enabled } = req.body;
        await modelService.toggleModel(projectId, modelName, enabled);
        res.json({ code: 0, data: { modelName, enabled } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});

// 获取推荐模型
modelComparisonRouter.get('/api/model/recommended/:projectId', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const { taskType } = req.query;
        const modelName = await modelService.getRecommendedModel(
            parseInt(projectId), 
            (taskType as string) || 'storyboard_image'
        );
        res.json({ code: 0, data: { modelName } });
    } catch (err: any) {
        res.json({ code: -1, msg: err.message });
    }
});
