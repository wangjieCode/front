import React from 'react';
import { Button, Typography } from 'antd';
import {
  RocketOutlined,
  CodeOutlined,
  BranchesOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
  CloudServerOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import './IntroPage.css';

const { Title, Paragraph, Text } = Typography;

const MobileIntroPage: React.FC = () => {
  const navigate = useNavigate();

  const quickActions = [
    { label: '立即创建对话', action: () => navigate('/') },
    { label: '项目管理', action: () => navigate('/projects') },
  ];

  const highlights = [
    {
      icon: <RobotOutlined />,
      title: '智能协作',
      desc: '快速理解需求，生成可执行方案与代码变更。',
    },
    {
      icon: <BranchesOutlined />,
      title: '开发闭环',
      desc: '从需求、实现到 MR，流程可追踪。',
    },
    {
      icon: <CloudServerOutlined />,
      title: '云端执行',
      desc: '无需本地环境，随时推进任务。',
    },
  ];

  const capabilities = [
    { icon: <CodeOutlined />, text: '智能改代码与结构优化' },
    { icon: <ApiOutlined />, text: '接口调用与数据检查' },
    { icon: <SafetyCertificateOutlined />, text: '自动化校验与建议' },
  ];

  const steps = [
    { title: '选项目', desc: '选择目标仓库与基线分支' },
    { title: '描述需求', desc: '一句话描述你要的变化' },
    { title: '开始执行', desc: 'AI 生成方案并持续更新' },
  ];

  return (
    <div className="mobile-intro">
      <header className="mobile-intro-header">
        <div className="mobile-intro-brand">
          <img src="/ai-avatar.png" alt="logo" />
          <span>前端小秘</span>
        </div>
        <Button type="primary" size="small" onClick={() => navigate('/')}>开始使用</Button>
      </header>

      <main className="mobile-intro-main">
        <section className="hero-card">
          <div className="hero-badge">AI 前端实习生</div>
          <Title level={2} className="hero-title">让协作更轻快</Title>
          <Paragraph className="hero-subtitle">
            面向移动端的轻量入口，快速发起对话与任务。
          </Paragraph>
          <div className="hero-actions">
            {quickActions.map((item) => (
              <Button key={item.label} type="default" onClick={item.action} block>
                {item.label}
              </Button>
            ))}
          </div>
          <div className="hero-note">
            <CheckCircleOutlined /> 已支持模型选择、流式对话、MR 创建
          </div>
        </section>

        <section className="highlight-section">
          <Title level={4}>核心亮点</Title>
          <div className="highlight-grid">
            {highlights.map((item) => (
              <div className="highlight-card" key={item.title}>
                <div className="highlight-icon">{item.icon}</div>
                <div>
                  <Text strong>{item.title}</Text>
                  <Paragraph>{item.desc}</Paragraph>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="capability-section">
          <Title level={4}>能力概览</Title>
          <div className="capability-list">
            {capabilities.map((item) => (
              <div className="capability-item" key={item.text}>
                <span className="capability-icon">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="step-section">
          <Title level={4}>三步开始</Title>
          <div className="step-list">
            {steps.map((step, index) => (
              <div className="step-item" key={step.title}>
                <div className="step-index">0{index + 1}</div>
                <div>
                  <Text strong>{step.title}</Text>
                  <Paragraph>{step.desc}</Paragraph>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-card">
            <div>
              <Title level={4}>准备开始了吗？</Title>
              <Paragraph>选择项目，描述需求，即刻进入对话。</Paragraph>
            </div>
            <Button type="primary" icon={<RocketOutlined />} block onClick={() => navigate('/')}>创建新对话</Button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default MobileIntroPage;
