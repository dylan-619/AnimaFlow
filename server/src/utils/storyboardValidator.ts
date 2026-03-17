/**
 * 分镜质量检查工具
 * 用于验证分镜数据的完整性和质量
 */

export interface Storyboard {
    id: number;
    segmentIndex: number;
    shotIndex: number;
    shotPrompt: string | null;
    shotAction: string | null;
    shotDuration?: number;
    cameraMovement: string | null;
    dubbingText: string | null;
    videoPrompt: string | null;
    filePath: string | null;
}

export interface ValidationIssue {
    shotId: number;
    shotIndex: string;
    type: 'missing_shot_prompt' | 'missing_shot_action' | 'missing_video_prompt' |
           'invalid_duration' | 'inconsistent_shot' | 'missing_file_path';
    message: string;
    severity: 'error' | 'warning';
}

export interface ValidationResult {
    isValid: boolean;
    issueCount: number;
    errorCount: number;
    warningCount: number;
    issues: ValidationIssue[];
    report: string;
}

/**
 * 验证单个分镜
 */
function validateShot(shot: Storyboard): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const shotLabel = `S${shot.segmentIndex}-${shot.shotIndex}`;

    // 1. 检查首帧提示词
    if (!shot.shotPrompt || shot.shotPrompt.trim().length === 0) {
        issues.push({
            shotId: shot.id,
            shotIndex: shotLabel,
            type: 'missing_shot_prompt',
            message: '首帧提示词缺失',
            severity: 'error'
        });
    } else if (shot.shotPrompt.length < 10) {
        issues.push({
            shotId: shot.id,
            shotIndex: shotLabel,
            type: 'missing_shot_prompt',
            message: '首帧提示词过短，可能导致图片质量不佳',
            severity: 'warning'
        });
    }

    // 2. 检查动作序列
    if (!shot.shotAction || shot.shotAction.trim().length === 0) {
        issues.push({
            shotId: shot.id,
            shotIndex: shotLabel,
            type: 'missing_shot_action',
            message: '动作序列缺失，视频可能无动态效果',
            severity: 'warning'
        });
    }

    // 3. 检查视频提示词
    if (!shot.videoPrompt || shot.videoPrompt.trim().length === 0) {
        issues.push({
            shotId: shot.id,
            shotIndex: shotLabel,
            type: 'missing_video_prompt',
            message: '视频提示词缺失，视频生成质量将受影响',
            severity: 'error'
        });
    } else if (shot.videoPrompt.length < 20) {
        issues.push({
            shotId: shot.id,
            shotIndex: shotLabel,
            type: 'missing_video_prompt',
            message: '视频提示词过短，可能导致视频生成不完整',
            severity: 'warning'
        });
    }

    // 4. 检查时长
    if (shot.shotDuration) {
        if (shot.shotDuration < 1) {
            issues.push({
                shotId: shot.id,
                shotIndex: shotLabel,
                type: 'invalid_duration',
                message: `时长过短（${shot.shotDuration}秒），建议至少2秒`,
                severity: 'error'
            });
        } else if (shot.shotDuration > 15) {
            issues.push({
                shotId: shot.id,
                shotIndex: shotLabel,
                type: 'invalid_duration',
                message: `时长过长（${shot.shotDuration}秒），建议拆分为多个镜头`,
                severity: 'warning'
            });
        }
    }

    // 5. 检查首帧与动作一致性
    if (shot.shotPrompt && shot.shotAction) {
        const promptChars = shot.shotPrompt.length;
        const actionChars = shot.shotAction.length;

        // 如果提示词和动作长度差异过大，可能不一致
        if (promptChars > 0 && actionChars) {
            const ratio = actionChars / promptChars;
            if (ratio > 10) {
                issues.push({
                    shotId: shot.id,
                    shotIndex: shotLabel,
                    type: 'inconsistent_shot',
                    message: '动作序列与首帧提示词长度差异过大，可能存在不一致',
                    severity: 'warning'
                });
            }
        }
    }

    // 6. 检查文件路径
    if (!shot.filePath || shot.filePath.trim().length === 0) {
        issues.push({
            shotId: shot.id,
            shotIndex: shotLabel,
            type: 'missing_file_path',
            message: '分镜图片未生成',
            severity: 'warning'
        });
    }

    return issues;
}

/**
 * 验证分镜编号连续性
 */
function validateContinuity(shots: Storyboard[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 检查 shotIndex 是否连续
    const sortedShots = [...shots].sort((a, b) => a.shotIndex - b.shotIndex);
    for (let i = 1; i < sortedShots.length; i++) {
        const prev = sortedShots[i - 1];
        const curr = sortedShots[i];

        if (curr.shotIndex !== prev.shotIndex + 1) {
            issues.push({
                shotId: curr.id,
                shotIndex: `S${curr.segmentIndex}-${curr.shotIndex}`,
                type: 'inconsistent_shot',
                message: `分镜编号不连续：S${prev.segmentIndex}-${prev.shotIndex} → S${curr.segmentIndex}-${curr.shotIndex}`,
                severity: 'warning'
            });
        }
    }

    return issues;
}

/**
 * 生成质量报告
 */
function generateReport(issues: ValidationIssue[], shotCount: number): string {
    if (issues.length === 0) {
        return `✅ 分镜质量检查通过\n\n共检查 ${shotCount} 个分镜，全部合格`;
    }

    const errors = issues.filter(i => i.severity === 'error');
    const warnings = issues.filter(i => i.severity === 'warning');

    let report = `📊 分镜质量检查报告\n\n`;
    report += `共检查 ${shotCount} 个分镜\n`;
    report += `❌ 错误：${errors.length} 个\n`;
    report += `⚠️ 警告：${warnings.length} 个\n\n`;

    if (errors.length > 0) {
        report += `=== 错误详情 ===\n`;
        errors.forEach(issue => {
            report += `[${issue.shotIndex}] ${issue.message}\n`;
        });
        report += `\n`;
    }

    if (warnings.length > 0) {
        report += `=== 警告详情 ===\n`;
        warnings.forEach(issue => {
            report += `[${issue.shotIndex}] ${issue.message}\n`;
        });
    }

    return report;
}

/**
 * 主验证函数
 * @param shots 分镜数组
 * @returns 验证结果
 */
export function validateStoryboard(shots: Storyboard[]): ValidationResult {
    const allIssues: ValidationIssue[] = [];

    // 1. 验证每个分镜
    for (const shot of shots) {
        const shotIssues = validateShot(shot);
        allIssues.push(...shotIssues);
    }

    // 2. 验证编号连续性
    const continuityIssues = validateContinuity(shots);
    allIssues.push(...continuityIssues);

    // 3. 统计结果
    const errors = allIssues.filter(i => i.severity === 'error');
    const warnings = allIssues.filter(i => i.severity === 'warning');

    return {
        isValid: errors.length === 0,
        issueCount: allIssues.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        issues: allIssues,
        report: generateReport(allIssues, shots.length)
    };
}

/**
 * 获取需要修复的分镜 ID
 * @returns 需要修复的分镜 ID 数组
 */
export function getShotsNeedingFix(issues: ValidationIssue[]): number[] {
    const errorIssues = issues.filter(i => i.severity === 'error');
    return [...new Set(errorIssues.map(i => i.shotId))];
}

/**
 * 快速检查（仅返回是否通过，不生成详细报告）
 */
export function quickValidate(shots: Storyboard[]): boolean {
    for (const shot of shots) {
        // 必备检查
        if (!shot.shotPrompt?.trim()) return false;
        if (!shot.videoPrompt?.trim()) return false;
        if (shot.shotDuration && shot.shotDuration < 1) return false;
    }
    return true;
}
