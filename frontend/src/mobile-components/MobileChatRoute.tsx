import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import MobileConversationView from './MobileConversationView';
import { ConversationMode, ConversationVisibility, ImageAttachment } from '../types/conversation';

const MobileChatRoute: React.FC<{
  onNewConversation: (
    prompt: string,
    mode: ConversationMode,
    projectId: string,
    baseBranch?: string,
    model?: string,
    initialImages?: ImageAttachment[]
  ) => Promise<void>;
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  onVisibilityChange: (sessionId: string, visibility: ConversationVisibility) => void;
}> = ({ onNewConversation, mode, onModeChange, onVisibilityChange }) => {
  const { sessionId } = useParams();
  const { state } = useLocation();

  return (
    <MobileConversationView
      key={sessionId}
      sessionId={sessionId}
      initialSession={state?.session}
      initialPrompt={state?.initialPrompt}
      autoSend={state?.autoSend}
      initialContent={state?.initialContent}
      initialImages={state?.initialImages}
      onNewConversation={onNewConversation}
      onVisibilityChange={onVisibilityChange}
      mode={mode}
      onModeChange={onModeChange}
    />
  );
};

export default MobileChatRoute;
