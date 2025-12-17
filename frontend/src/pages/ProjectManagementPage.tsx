/**
 * 项目管理页面
 * 用于项目的增删改查（CRUD）操作
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table,
    Button,
    Space,
    message,
    Modal,
    Form,
    Input,
    Card,
    Typography,
    Popconfirm,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ArrowLeftOutlined,
} from '@ant-design/icons';
import { projectService, Project } from '../services/projectService';
import { authService } from '../services/authService';

const { Title } = Typography;

export const ProjectManagementPage: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [form] = Form.useForm();
    const navigate = useNavigate();

    useEffect(() => {
        if (!authService.isAuthenticated()) {
            navigate('/');
            return;
        }
        loadProjects();
    }, [navigate]);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const projectList = await projectService.getActiveProjects();
            setProjects(projectList);
        } catch (error) {
            console.error('加载项目列表失败:', error);
            message.error('加载项目列表失败');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingProject(null);
        form.resetFields();
        setModalVisible(true);
    };

    const handleEdit = (project: Project) => {
        setEditingProject(project);
        form.setFieldsValue(project);
        setModalVisible(true);
    };

    const handleDelete = async (projectId: string) => {
        try {
            await projectService.deleteProject(projectId, false);
            message.success('项目已停用');
            loadProjects();
        } catch (error) {
            console.error('删除项目失败:', error);
            message.error(error instanceof Error ? error.message : '删除项目失败');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            if (editingProject) {
                await projectService.updateProject(editingProject.id, values);
                message.success('项目更新成功');
            } else {
                values.worktreeBaseDir = `${values.repoDir}-worktrees`;
                await projectService.createProject(values);
                message.success('项目创建成功');
            }

            setModalVisible(false);
            loadProjects();
        } catch (error) {
            console.error('保存项目失败:', error);
            message.error(error instanceof Error ? error.message : '保存项目失败');
        }
    };

    const columns = [
        {
            title: '项目名称',
            dataIndex: 'projectName',
            key: 'projectName',
        },
        {
            title: '项目标识',
            dataIndex: 'projectKey',
            key: 'projectKey',
        },
        {
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        },
        {
            title: '仓库目录',
            dataIndex: 'repoDir',
            key: 'repoDir',
            ellipsis: true,
        },
        {
            title: '默认分支',
            dataIndex: 'gitDefaultBranch',
            key: 'gitDefaultBranch',
        },
        {
            title: '状态',
            dataIndex: 'configStatus',
            key: 'configStatus',
            render: (status: string) => (
                <span style={{ color: status === 'complete' ? '#52c41a' : '#faad14' }}>
                    {status === 'complete' ? '✅ 配置完整' : '⚠️ 配置不完整'}
                </span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: Project) => (
                <Space size="small">
                    <Button
                        type="link"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        编辑
                    </Button>
                    <Popconfirm
                        title="确认删除"
                        description="确定要删除这个项目吗？"
                        onConfirm={() => handleDelete(record.id)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                    >
                        <Button
                            type="link"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                        >
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{
            minHeight: '100vh',
            background: '#f0f2f5',
            padding: '24px',
        }}>
            <Card style={{ maxWidth: 1200, margin: '0 auto' }}>
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => navigate('/')}
                            >
                                返回
                            </Button>
                            <Title level={2} style={{ margin: 0 }}>项目管理</Title>
                        </Space>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={handleCreate}
                        >
                            新建项目
                        </Button>
                    </div>

                    <Table
                        columns={columns}
                        dataSource={projects}
                        rowKey="id"
                        loading={loading}
                        pagination={{
                            pageSize: 10,
                            showTotal: (total) => `共 ${total} 个项目`,
                        }}
                    />
                </Space>
            </Card>

            <Modal
                title={editingProject ? '编辑项目' : '新建项目'}
                open={modalVisible}
                onOk={handleSubmit}
                onCancel={() => setModalVisible(false)}
                okText="保存"
                cancelText="取消"
                width={600}
            >
                <Form
                    form={form}
                    layout="vertical"
                    style={{ marginTop: 16 }}
                >
                    <Form.Item
                        name="projectName"
                        label="项目名称"
                        rules={[{ required: true, message: '请输入项目名称' }]}
                    >
                        <Input placeholder="例如：前端实习生系统" />
                    </Form.Item>

                    <Form.Item
                        name="projectKey"
                        label="项目标识"
                        rules={[
                            { required: true, message: '请输入项目标识' },
                            { pattern: /^[A-Z0-9_]+$/, message: '只能包含大写字母、数字和下划线' }
                        ]}
                    >
                        <Input 
                            placeholder="例如：FRONT_INTERN" 
                            disabled={!!editingProject}
                        />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="项目描述"
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder="简要描述项目的用途和功能"
                        />
                    </Form.Item>

                    <Form.Item
                        name="repoDir"
                        label="仓库目录"
                        rules={[{ required: true, message: '请输入仓库目录路径' }]}
                    >
                        <Input placeholder="例如：/Users/admin/projects/front-intern" />
                    </Form.Item>

                    <Form.Item
                        name="gitDefaultBranch"
                        label="默认分支"
                        rules={[{ required: true, message: '请输入默认分支名' }]}
                        initialValue="main"
                    >
                        <Input placeholder="例如：main 或 master" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ProjectManagementPage;
