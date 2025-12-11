-- 添加 preview_info 字段到 conversation_contexts 表
-- 用于持久化保存预览部署的完整信息

ALTER TABLE conversation_contexts 
ADD COLUMN IF NOT EXISTS preview_info JSONB;

-- 添加注释
COMMENT ON COLUMN conversation_contexts.preview_info IS '预览部署信息：包含镜像 ID、容器 ID、运行状态、访问地址等';

-- 创建索引以优化查询
CREATE INDEX IF NOT EXISTS idx_contexts_preview_status 
ON conversation_contexts ((preview_info->>'status')) 
WHERE preview_info IS NOT NULL;

COMMENT ON INDEX idx_contexts_preview_status IS '优化按预览状态查询的性能';
