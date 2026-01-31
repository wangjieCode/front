import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import ConversationView from './ConversationView';
import { ConversationMode, ConversationVisibility } from '../types/conversation';

const ChatRoute: React.FC<{
  onNewConversation: (prompt: string, mode: ConversationMode, projectId: string, baseBranch?: string) => Promise<void>;
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  onVisibilityChange: (sessionId: string, visibility: ConversationVisibility) => void;
}> = ({ onNewConversation, mode, onModeChange, onVisibilityChange }) => {
  const { sessionId } = useParams();
  const { state } = useLocation();

  return (
    <ConversationView
      key={sessionId}
      sessionId={sessionId}
      initialSession={state?.session}
      initialPrompt={state?.initialPrompt}
      autoSend={state?.autoSend}
      initialContent={state?.initialContent}
      onNewConversation={onNewConversation}
      onVisibilityChange={onVisibilityChange}
      mode={mode}
      onModeChange={onModeChange}
    />
  );
};

export default ChatRoute;
