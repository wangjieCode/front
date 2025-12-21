import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  message,
  Space,
  Typography,
  Table,
  Tag,
  Select,
  Input,
  Popconfirm,
  Form,
  Divider,
  Alert,
  List,
  Avatar,
} from 'antd';
import {
  TeamOutlined,
  UserAddOutlined,
  EditOutlined,
  DeleteOutlined,
  CrownOutlined,
  SafetyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Project, ProjectMember, MemberRole, AddMemberRequest } from '../types/project';
import { projectService } from '../services/projectService';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;

interface MemberManageModalProps {
  visible: boolean;
  project: Project | null;
  onCancel: () => void;
  onUpdate: () => void;
}

const MemberManageModal: React.FC<MemberManageModalProps> = ({
  visible,
  project,
  onCancel,
  onUpdate,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null);

  // 加载成员列表
  const loadMembers = async () => {
    if (!project) return;

    try {
      setMembersLoading(true);
      const response = await projectService.getMembers(project.id);
      
      if (response.success && response.data) {
        setMembers(response.data);
      } else {
        message.error(response.error || '加载成员列表失败');
      }
    } catch (error) {
      console.error('加载成员列表失败:', error);
      message.error('加载成员列表失败');
    } finally {
      setMembersLoading(false);
    }
  };

  // 模态框打开时加载成员列表
  useEffect(() => {
    if (visible && project) {
      loadMembers();
    }
  }, [visible, project]);

  // 重置表单和状态
  const handleCancel = () => {
    form.resetFields();
    setEditingMember(null);
    setAddingMember(false);
    onCancel();
  };

  // 开始添加成员
  const handleAddMember = () => {
    setEditingMember(null);
    setAddingMember(true);
    form.resetFields();
  };

  // 开始编辑成员
  const handleEditMember = (member: ProjectMember) => {
    setEditingMember(member);
    setAddingMember(false);
    form.setFieldsValue({
      userId: member.user?.username,
      role: member.role,
    });
  };

  // 取消添加/编辑
  const handleEditCancel = () => {
    form.resetFields();
    setAddingMember(false);
    setEditingMember(null);
  };

  // 添加/更新成员
  const handleSaveMember = async () => {
    if (!project) return;

    try {
      setLoading(true);
      const values = await form.validateFields();
      
      if (addingMember) {
        // 添加新成员
        const requestData: AddMemberRequest = {
          userId: values.userId,
          role: values.role,
        };

        const response = await projectService.addMember(project.id, requestData);
        
        if (response.success) {
          message.success('成员添加成功');
          handleEditCancel();
          loadMembers();
          onUpdate();
        } else {
          message.error(response.error || '添加成员失败');
        }
      } else if (editingMember) {
        // 更新成员角色
        const response = await projectService.updateMemberRole(
          project.id,
          editingMember.userId,
          values.role
        );
        
        if (response.success) {
          message.success('成员角色更新成功');
          handleEditCancel();
          loadMembers();
          onUpdate();
        } else {
          message.error(response.error || '更新成员角色失败');
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      message.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 移除成员
  const handleRemoveMember = async (member: ProjectMember) => {
    if (!project) return;

    try {
      const response = await projectService.removeMember(project.id, member.userId);
      
      if (response.success) {
        message.success('成员移除成功');
        loadMembers();
        onUpdate();
      } else {
        message.error(response.error || '移除成员失败');
      }
    } catch (error) {
      console.error('移除成员失败:', error);
      message.error('移除成员失败');
    }
  };

  // 获取角色标签
  const getRoleTag = (role: MemberRole) => {
    switch (role) {
      case MemberRole.OWNER:
        return <Tag color="red" icon={<CrownOutlined />}>所有者</Tag>;
      case MemberRole.ADMIN:
        return <Tag color="orange" icon={<SafetyOutlined />}>管理员</Tag>;
      case MemberRole.MEMBER:
        return <Tag color="blue" icon={<UserOutlined />}>成员</Tag>;
      default:
        return <Tag>{role}</Tag>;
    }
  };

  // 获取角色选项
  const getRoleOptions = () => {
    const options = [
      { value: MemberRole.MEMBER, label: '成员', color: 'blue' },
      { value: MemberRole.ADMIN, label: '管理员', color: 'orange' },
    ];

    // 只有在添加新成员时才显示所有者选项
    if (addingMember) {
      options.unshift({ value: MemberRole.OWNER, label: '所有者', color: 'red' });
    }

    return options;
  };

  // 表格列定义
  const columns = [
    {
      title: '用户',
      dataIndex: 'user',
      key: 'user',
      render: (user: ProjectMember['user']) => (
        <Space>
          <Avatar icon={<UserOutlined />} size="small" />
          <div>
            <div>{user?.username || '未知用户'}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {user?.id}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: MemberRole) => getRoleTag(role),
    },
    {
      title: '加入时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: ProjectMember) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditMember(record)}
            disabled={record.role === MemberRole.OWNER}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要移除这个成员吗？"
            description="移除后该用户将无法访问项目"
            onConfirm={() => handleRemoveMember(record)}
            okText="移除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={record.role === MemberRole.OWNER}
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={record.role === MemberRole.OWNER}
            >
              移除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <TeamOutlined />
          <span>成员管理 - {project?.name}</span>
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      width={800}
      footer={null}
    >
      {project && (
        <>
          {/* 添加成员表单 */}
          {addingMember || editingMember ? (
            <div style={{ marginBottom: 24 }}>
              <Title level={5}>
                {addingMember ? '添加新成员' : '编辑成员角色'}
              </Title>
              
              <Form
                form={form}
                layout="inline"
                onFinish={handleSaveMember}
              >
                <Form.Item
                  name="userId"
                  label="用户名"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 2, max: 50, message: '用户名长度必须在 2-50 个字符之间' },
                  ]}
                  style={{ flex: 1 }}
                >
                  <Input
                    placeholder="请输入用户名"
                    disabled={!addingMember} // 编辑时不能修改用户名
                  />
                </Form.Item>

                <Form.Item
                  name="role"
                  label="角色"
                  rules={[{ required: true, message: '请选择角色' }]}
                >
                  <Select
                    placeholder="请选择角色"
                    style={{ width: 120 }}
                  >
                    {getRoleOptions().map(option => (
                      <Option key={option.value} value={option.value}>
                        <Tag color={option.color} style={{ marginRight: 4 }}>
                          {option.label}
                        </Tag>
                        {option.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item>
                  <Space>
                    <Button onClick={handleEditCancel}>
                      取消
                    </Button>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      className="btn-primary"
                    >
                      {addingMember ? '添加' : '更新'}
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
              
              <Divider />
            </div>
          ) : (
            <div style={{ marginBottom: 24 }}>
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                onClick={handleAddMember}
                className="btn-primary"
              >
                添加成员
              </Button>
            </div>
          )}

          {/* 成员列表 */}
          <Table
            columns={columns}
            dataSource={members}
            loading={membersLoading}
            rowKey="id"
            pagination={false}
            size="small"
            locale={{
              emptyText: '暂无成员',
            }}
          />

          {/* 权限说明 */}
          <Alert
            message="权限说明"
            description={
              <div>
                <div>• <Tag color="red">所有者</Tag>：拥有所有权限，可以管理项目和成员</div>
                <div>• <Tag color="orange">管理员</Tag>：可以管理成员和修改项目信息</div>
                <div>• <Tag color="blue">成员</Tag>：可以查看项目和创建对话</div>
                <div style={{ marginTop: 8, color: '#666' }}>
                  注意：项目所有者不能被移除或编辑角色
                </div>
              </div>
            }
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </>
      )}
    </Modal>
  );
};

export default MemberManageModal;