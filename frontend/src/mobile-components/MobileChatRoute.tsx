import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import MobileConversationView from './MobileConversationView';
import { ConversationVisibility, ImageAttachment } from '../types/conversation';

const MobileChatRoute: React.FC<{
  onNewConversation: (
    prompt: string,
    projectId: string,
    baseBranch?: string,
    model?: string,
    initialImages?: ImageAttachment[]
  ) => Promise<void>;
  onVisibilityChange: (sessionId: string, visibility: ConversationVisibility) => void;
}> = ({ onNewConversation, onVisibilityChange }) => {
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
    />
  );
};

export default MobileChatRoute;
