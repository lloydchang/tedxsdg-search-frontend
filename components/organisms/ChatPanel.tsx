// File: components/organisms/ChatPanel.tsx

'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from 'store/store';
import { sendMessage, clearMessages } from 'store/chatSlice';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import BackgroundImage from 'public/images/TEDxSDG.webp';
import styles from 'styles/components/organisms/ChatPanel.module.css';
import useMedia from 'components/state/hooks/useMedia';
import ChatInput from 'components/organisms/ChatInput';
import Tools from 'components/organisms/Tools';
import SpeechTest from 'components/atoms/SpeechTest';
import { Message } from 'types';
import { trace } from '@opentelemetry/api';

const HeavyChatMessages = dynamic(() => import('components/molecules/ChatMessages'), {
  ssr: false,
}) as React.ComponentType<{ messages: Message[]; isFullScreen: boolean }>;

const ChatPanel: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const messages = useSelector((state: RootState) => state.chat.messages);
  const { mediaState, toggleMic, startCam, stopCam, togglePip, toggleMem } = useMedia();

  const [chatInput, setChatInput] = useState<string>('');
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Automatically scroll to the bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current && !isFullScreen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isFullScreen]);

  const hasVisibleMessages = messages.some((message) => !message.hidden);



  const handleChat = useCallback(() => {
    const trimmedMessage = chatInput.trim();
    if (trimmedMessage) {
      const tracer = trace.getTracer('tedxsdg-search-frontend');
      tracer.startActiveSpan('send_message', async (span) => {
        span.setAttribute('message.length', trimmedMessage.length);
        try {
          await dispatch(sendMessage(trimmedMessage));
          console.log('ChatPanel - Message sent:', trimmedMessage);
          setChatInput('');
        } catch (error) {
          span.recordException(error as any);
          console.error('ChatPanel - Error sending message:', error);
        } finally {
          span.end();
        }
      });
    }
  }, [chatInput, dispatch]);

  const handleClearChat = useCallback(() => {
    dispatch(clearMessages());
    console.log('ChatPanel - Chat history cleared.');
  }, [dispatch]);

  const toggleFullScreenMode = useCallback(() => {
    const elem = document.documentElement;

    if (!isFullScreen) {
      elem.requestFullscreen().catch((err) =>
        console.error(`Failed to enter fullscreen mode: ${err.message}`)
      );
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) =>
        console.error(`Failed to exit fullscreen mode: ${err.message}`)
      );
    }
    setIsFullScreen((prev) => !prev);
  }, [isFullScreen]);

  const handleSpeechResult = useCallback(
    (finalResult: string) => {
      const trimmedResult = finalResult.trim();
      if (trimmedResult) {
        dispatch(sendMessage({ text: trimmedResult, hidden: false }));
        console.log('ChatPanel - Final speech sent as message:', trimmedResult);
        setInterimSpeech('');
        setChatInput('');
      }
    },
    [dispatch]
  );

  const handleInterimUpdate = useCallback((interimResult: string) => {
    setInterimSpeech(interimResult);
  }, []);

  return (
    <div
      className={`${styles.container} ${isFullScreen ? styles.fullScreenMode : styles['Chat-panel']
        }`}
    >
      <Image
        src={BackgroundImage}
        priority  // Add this to load the image with high priority
        alt="Background image"  // Ensure accessibility
        fill
        className={styles.backgroundImage}
        unoptimized
      />
      <div className={styles.overlay} />

      <div className={`${styles.container} ${styles['Chat-panel']}`}>
        <div className={`${styles.toolsLayer} ${isFullScreen ? styles.minimized : ''}`}>
          <Tools />
        </div>

        <div className={`${styles.chatLayer} ${isFullScreen ? styles.fullScreenChat : ''}`}>
          <HeavyChatMessages messages={messages} isFullScreen={isFullScreen} />

          <SpeechTest
            isMicOn={mediaState.isMicOn}
            toggleMic={toggleMic}
            onSpeechResult={handleSpeechResult}
            onInterimUpdate={handleInterimUpdate}
            showIsListening={false}
            showFinalResult={false}
          />

          <ChatInput
            chatInput={chatInput}
            setChatInput={setChatInput}
            handleChat={handleChat}
            isCamOn={mediaState.isCamOn}
            isMicOn={mediaState.isMicOn}
            toggleMic={toggleMic}
            startCam={startCam}
            stopCam={stopCam}
            isPipOn={mediaState.isPipOn}
            togglePip={togglePip}
            isMemOn={mediaState.isMemOn}
            toggleMem={toggleMem}
            eraseMemory={handleClearChat}
            isFullScreenOn={isFullScreen}
            toggleFullScreen={toggleFullScreenMode}
            hasVisibleMessages={hasVisibleMessages}
            isListening={isListening}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatPanel);
