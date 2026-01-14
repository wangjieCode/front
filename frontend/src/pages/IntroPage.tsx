import React from 'react';
import { Typography, Row, Col, Space, Button } from 'antd';
import {
  CloudServerOutlined,
  BranchesOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  RocketOutlined,
  CodeOutlined,
  ApiOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import './IntroPage.css';

const { Title, Paragraph } = Typography;

const IntroPage: React.FC = () => {
  const navigate = useNavigate();
  /* 
   * Agent Configuration
   * Codex: Code intelligence (CodeOutlined)
   * iFlow: Intelligent Flow (BranchesOutlined - representing flow)
   * CC: Code Completion/Chat (RobotOutlined)
   * UI/UX: Design (highlighted with LayoutOutlined style icon, using ApiOutlined as placeholder or similar)
   */
  const [currentAgent, setCurrentAgent] = React.useState(0);
  const agents = [
    { name: 'Codex Agent', icon: <CodeOutlined /> },
    { name: 'iFlow Agent', icon: <BranchesOutlined /> },
    { name: 'CC Agent', icon: <RobotOutlined /> },
    { name: 'UI/UX Agent', icon: <ApiOutlined /> }
  ];

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentAgent((prev) => (prev + 1) % agents.length);
    }, 2500); // Slightly slower for better readability
    return () => clearInterval(interval);
  }, []);

  const coreFeatures = [
    {
      icon: <CloudServerOutlined style={{ fontSize: '40px', color: '#7c5cff' }} />,
      title: '云端智能工作台',
      description: '融合云端工作空间与 Codex / iFlow 等编码 Agent，提供超越本地的深度代码理解与编辑能力。'
    },
    {
      icon: <BranchesOutlined style={{ fontSize: '40px', color: '#7c5cff' }} />,
      title: '全链路研发集成',
      description: '深度打通 GitLab 版本控制与 Zadig 测试发布平台，实现从需求开发到自动部署的闭环。'
    },
    {
      icon: <RobotOutlined style={{ fontSize: '40px', color: '#7c5cff' }} />,
      title: '您的 AI 实习生',
      description: '不仅是工具，更是助手。独立处理调研、查询及简单开发任务，自动化生成 MR 与无缝协作。'
    }
  ];

  const scenarios = [
    {
      title: '深度调研与理解',
      items: ['接口文档智能查询', '技术实现方案调研', '代码字段使用查找', '业务逻辑深度检查']
    },
    {
      title: '轻量级需求开发',
      items: ['文案内容快速变更', '页面样式微调优化', '简单功能逻辑实现', '自动化结果验证']
    },
    {
      title: '自动化协作交付',
      items: ['代码自动提交', '智能生成 Merge Request', '无缝转交专业审核', '对接自动化发布']
    }
  ];

  const marqueeTags = [
    { icon: <CodeOutlined />, text: 'Codex Agent' },
    { icon: <ApiOutlined />, text: 'GitLab Integrated' },
    { icon: <RocketOutlined />, text: 'Zadig Deploy' },
    { icon: <RobotOutlined />, text: 'Intelligent Flow' },
    { icon: <SafetyCertificateOutlined />, text: 'Auto Review' },
    { icon: <CloudServerOutlined />, text: 'Cloud Workspace' },
    { icon: <BranchesOutlined />, text: 'Smart Merge' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      {/* Header */}
      <div className="intro-header">
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          padding: '0 20px', 
          height: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
             <img src="/ai-avatar.png" alt="logo" style={{ width: 32, height: 32, borderRadius: '50%' }} />
             <span style={{ fontSize: '20px', fontWeight: 600, color: '#333' }}>前端小秘</span>
          </div>
          <Space size="middle">
             <Button type="link" style={{ color: '#555' }} onClick={() => navigate('/projects')}>项目管理</Button>
             <Button type="primary" className="header-action-btn" onClick={() => navigate('/')}>立即使用</Button>
          </Space>
        </div>
      </div>

      {/* Hero Section */}
      <div className="intro-hero" style={{ padding: '120px 20px', textAlign: 'center', color: '#333' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <div className="hero-float-icon" style={{ marginBottom: '24px' }}>
            <RobotOutlined style={{ fontSize: '64px', color: '#7c5cff', opacity: 1 }} />
          </div>
          
          <Title level={1} style={{
            fontSize: '56px',
            marginBottom: '24px',
            color: '#1f1f1f',
            fontWeight: 800,
            letterSpacing: '-1px',
            textShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}>
            前端小秘
          </Title>
          <Paragraph style={{
            fontSize: '24px',
            color: '#333',
            maxWidth: '800px',
            margin: '0 auto 48px',
            lineHeight: '1.6',
            fontWeight: 300
          }}>
            您的专属 <span style={{ color: '#7c5cff', fontWeight: 600 }}>AI 前端实习生助理</span>
          </Paragraph>
          <Paragraph style={{
            fontSize: '18px',
            color: '#666',
            maxWidth: '700px',
            margin: '0 auto 48px'
          }}>
            通过云端工作空间 + 强大编码 Agent + 内部工作流集成，为您分担繁琐工作，让开发更专注、更高效。
          </Paragraph>
          <Space size="large">
            <Button type="primary" size="large" onClick={() => navigate('/')}
              className="pulse-btn"
              style={{
                height: '56px',
                padding: '0 48px',
                fontSize: '20px',
                borderRadius: '28px',
                background: '#7c5cff',
                borderColor: '#7c5cff',
                boxShadow: '0 8px 24px rgba(124, 92, 255, 0.4)',
                fontWeight: 600
              }}>
              开始协作
            </Button>
            <Button size="large" onClick={() => navigate('/projects')}
              style={{
                height: '56px',
                padding: '0 48px',
                fontSize: '20px',
                borderRadius: '28px',
                borderWidth: '1px',
                color: '#555',
                borderColor: '#d9d9d9',
                background: '#fff',
                fontWeight: 600
              }}>
              管理项目
            </Button>
          </Space>
        </div>
      </div>

      {/* Marquee Section */}
      <div className="marquee-container">
        <div className="marquee-content highlight-marquee">
           {[...marqueeTags, ...marqueeTags, ...marqueeTags].map((tag, index) => (
             <div key={`row1-${index}`} className="marquee-tag">
               {tag.icon} <span style={{ marginLeft: '8px' }}>{tag.text}</span>
             </div>
           ))}
        </div>
        <div className="marquee-content highlight-marquee-reverse" style={{ marginTop: '20px' }}>
           {[...marqueeTags.reverse(), ...marqueeTags, ...marqueeTags].map((tag, index) => (
             <div key={`row2-${index}`} className="marquee-tag">
               {tag.icon} <span style={{ marginLeft: '8px' }}>{tag.text}</span>
             </div>
           ))}
        </div>
      </div>

      {/* Concept Composition Animation Module */}
      <div className="concept-section">
        <div className="concept-module-container">
          <div className="concept-module-header">
            <span className="concept-main-title">前端小秘</span>
            <span className="concept-math-symbol">=</span>
          </div>
          
          <div className="concept-content-row">
            {/* Workflow Card (Left) */}
            <div className="concept-card">
              <BranchesOutlined className="concept-icon" style={{ color: '#52c41a' }} />
              <div className="concept-title">星云协作工作流</div>
              <div className="concept-desc">GitLab + Zadig 深度集成，自动流转</div>
            </div>

            <div className="concept-plus">+</div>

            {/* Agent Switcher Card (Center - Highlighted) */}
            <div className="concept-card concept-card-highlight">
              <div className="pulsing-circle"></div>
              
              {/* Dynamic Agent Icon */}
              <div style={{ marginBottom: '16px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <div key={currentAgent} className="agent-icon-anim">
                    {React.cloneElement(agents[currentAgent].icon as React.ReactElement, { style: { fontSize: '48px', color: '#7c5cff' } })}
                 </div>
              </div>

              <div style={{ position: 'relative', width: '100%', height: '40px', marginBottom: '8px', overflow: 'hidden' }}>
                <div className="agent-switcher">
                  <div className="agent-list" style={{ transform: `translateY(-${currentAgent * 40}px)` }}>
                    {agents.map((agent, index) => (
                      <div key={index} className="agent-item" style={{ height: '40px', fontSize: '20px' }}>
                        {agent.name}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="concept-title" style={{ fontSize: '20px', color: '#7c5cff' }}>多模态智能体</div>
              <div className="concept-desc" style={{ fontSize: '15px', maxWidth: '280px' }}>集结顶尖编程大脑，赋能全流程</div>
            </div>

            <div className="concept-plus">+</div>

            {/* Cloud Workspace Card (Right) */}
            <div className="concept-card">
              <CloudServerOutlined className="concept-icon" style={{ color: '#1890ff' }} />
              <div className="concept-title">云端空间</div>
              <div className="concept-desc">在线预览、变更审查、一键部署</div>
            </div>
          </div>
        </div>
      </div>

      {/* Core Features */}
      <div style={{ maxWidth: '1200px', margin: '80px auto 0', padding: '0 20px', position: 'relative', zIndex: 3 }}>
        <Row gutter={[24, 24]}>
          {coreFeatures.map((feature, index) => (
            <Col xs={24} md={8} key={index}>
              <div 
                className="feature-card"
                style={{ 
                  height: '100%', 
                  padding: '48px 32px', 
                  textAlign: 'center',
                  borderRadius: '24px',
                  background: '#fff',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.05)'
                }}
              >
                <div className="feature-icon-wrapper" style={{ 
                  marginBottom: '32px', 
                  display: 'inline-flex', 
                  padding: '24px', 
                  background: 'rgba(124, 92, 255, 0.08)', 
                  borderRadius: '50%' 
                }}>
                  {feature.icon}
                </div>
                <Title level={3} style={{ marginBottom: '20px', fontSize: '24px', color: '#333' }}>{feature.title}</Title>
                <Paragraph style={{ color: '#666', fontSize: '16px', lineHeight: '1.8' }}>
                  {feature.description}
                </Paragraph>
              </div>
            </Col>
          ))}
        </Row>
      </div>

      {/* Scenarios Section */}
      <div style={{ padding: '100px 20px', background: '#f8f9fa' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '80px' }}>
            <Title level={2} style={{ fontSize: '36px', marginBottom: '16px', fontWeight: 700 }}>全能力覆盖，不但懂代码，更懂业务</Title>
            <Paragraph style={{ fontSize: '18px', color: '#666' }}>从需求调研到代码交付，全方位辅助您的日常开发</Paragraph>
          </div>

          <Row gutter={[32, 32]}>
            {scenarios.map((scenario, index) => (
              <Col xs={24} md={8} key={index}>
                <div className="scenario-card" style={{ 
                  background: '#fff', 
                  padding: '40px', 
                  borderRadius: '20px', 
                  height: '100%', 
                  border: '1px solid #eee' 
                }}>
                  <Title level={4} style={{ 
                    marginBottom: '32px', 
                    fontSize: '22px', 
                    borderBottom: '2px solid #7c5cff', 
                    paddingBottom: '16px', 
                    display: 'inline-block',
                    color: '#333'
                  }}>
                    {scenario.title}
                  </Title>
                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    {scenario.items.map((item, idx) => (
                      <div key={idx} className="scenario-item" style={{ display: 'flex', alignItems: 'center' }}>
                         <CheckCircleOutlined className="check-icon" style={{ color: '#52c41a', marginRight: '16px', fontSize: '20px' }} />
                         <span style={{ fontSize: '16px', color: '#555', fontWeight: 500 }}>{item}</span>
                      </div>
                    ))}
                  </Space>
                </div>
              </Col>
            ))}
          </Row>
        </div>
      </div>
    </div>
  );
};

export default IntroPage;
