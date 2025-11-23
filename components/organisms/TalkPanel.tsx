// File: components/organisms/TalkPanel.tsx

'use client';

import React, { useState, useEffect, useRef, useCallback, createRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { RootState, AppDispatch } from 'store/store';
import { setTalks, setSelectedTalk } from 'store/talkSlice';
import { setLoading, setApiError } from 'store/apiSlice';
import { sendMessage } from 'store/chatSlice';
import { Talk } from 'types';
import { determineInitialKeyword, shuffleArray } from 'components/utils/talkPanelUtils';
import { localStorageUtil } from 'components/utils/localStorage';
import TalkItem from './TalkItem';
import LoadingSpinner from './LoadingSpinner';
import { debounce } from 'lodash';
import styles from 'styles/components/organisms/TalkPanel.module.css';
import { sdgTitleMap } from 'components/constants/sdgTitles';
import { trace, Span } from '@opentelemetry/api';

const isDevelopment = process.env.NODE_ENV === 'development';

// Helper function to convert SDG tags to full titles
const getSdgTitles = (sdgTags: string[]): string[] =>
  sdgTags.map(tag => sdgTitleMap[tag] || tag);

// Helper function for debug logging
const debugLog = (message: string) => console.debug(`[TalkPanel] ${message}`);

const TalkPanel: React.FC = () => {
  const dispatch: AppDispatch = useDispatch();
  const { talks, selectedTalk } = useSelector((state: RootState) => state.talk);
  const { isLoading, error } = useSelector((state: RootState) => state.api);

  const [searchQuery, setSearchQuery] = useState(determineInitialKeyword());
  const isStrictMode = useRef(false);
  const mountCounter = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSearchInProgress = useRef(false);
  const sentMessagesRef = useRef<Set<string>>(new Set());
  const scrollableContainerRef = useRef<HTMLDivElement>(null);

  // Ref to track the active watch span
  const activeWatchSpanRef = useRef<Span | null>(null);

  const debouncedPerformSearch = useCallback(
    debounce((query: string) => performSearch(query), 500),
    []
  );

  // Manage video watch span
  useEffect(() => {
    const tracer = trace.getTracer('tedxsdg-search-frontend');

    // End previous span if it exists
    if (activeWatchSpanRef.current) {
      activeWatchSpanRef.current.end();
      activeWatchSpanRef.current = null;
    }

    // Start new span if a talk is selected
    if (selectedTalk) {
      const span = tracer.startSpan('watch_video');
      span.setAttribute('video.title', selectedTalk.title);
      span.setAttribute('video.presenter', selectedTalk.presenterDisplayName);
      span.setAttribute('video.url', selectedTalk.url);
      span.setAttribute('video.sdg_tags', selectedTalk.sdg_tags);
      activeWatchSpanRef.current = span;
    }

    // Cleanup on unmount or when selectedTalk changes
    return () => {
      if (activeWatchSpanRef.current) {
        activeWatchSpanRef.current.end();
        activeWatchSpanRef.current = null;
      }
    };
  }, [selectedTalk]);

  useEffect(() => {
    if (isDevelopment) {
      mountCounter.current += 1;

      if (mountCounter.current === 1) {
        isStrictMode.current = true;
        debugLog('Initial mount detected; entering strict mode.');
      } else {
        isStrictMode.current = false;
        debugLog('Subsequent mount detected; exiting strict mode.');
        performSearch(searchQuery);
      }
    } else {
      performSearch(searchQuery);
    }

    return () => {
      if (isDevelopment && !isStrictMode.current) {
        abortControllerRef.current?.abort();
        debugLog('Cleanup: aborting any ongoing search requests.');
      }
      debouncedPerformSearch.cancel();
    };
  }, []);

  const performSearch = async (query: string) => {
    const tracer = trace.getTracer('tedxsdg-search-frontend');

    await tracer.startActiveSpan('search_talks', async (span) => {
      const trimmedQuery = query.trim().toLowerCase();
      span.setAttribute('search.query', trimmedQuery);
      debugLog(`Performing search with query: "${trimmedQuery}"`);

      if (isSearchInProgress.current) {
        debugLog('Search already in progress. Exiting.');
        span.setAttribute('search.skipped', true);
        span.end();
        return;
      }

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      isSearchInProgress.current = true;

      dispatch(setLoading(true));
      dispatch(setApiError(null));

      try {
        debugLog(`Making API request with query: "${trimmedQuery}"`);
        const response = await axios.get(
          `https://tedxsdg-search-backend.vercel.app/api/search?query=${encodeURIComponent(trimmedQuery)}`,
          { signal: abortControllerRef.current.signal }
        );

        if (response.status !== 200) throw new Error(response.statusText);

        const data: Talk[] = response.data.results.map((result: any) => ({
          presenterDisplayName: result.document.presenterDisplayName || '',
          title: result.document.slug.replace(/_/g, ' ') || '',
          url: `https://www.ted.com/talks/${result.document.slug}`,
          sdg_tags: result.document.sdg_tags || [],
          transcript: result.document.transcript || '',
        }));

        span.setAttribute('search.results_count', data.length);

        if (!isStrictMode.current) handleSearchResults(data);
      } catch (error) {
        if (!axios.isCancel(error)) {
          console.error('[performSearch] Error:', error);
          span.recordException(error as any);
          dispatch(setApiError('Error fetching talks.'));
        } else {
          span.setAttribute('search.cancelled', true);
        }
      } finally {
        dispatch(setLoading(false));
        isSearchInProgress.current = false;
        span.end();
      }
    });
  };

  const handleSearchResults = (data: Talk[]) => {
    debugLog(`Handling ${data.length} search results.`);
    dispatch(setTalks(data));

    if (data.length > 0) {
      const randomIndex = Math.floor(Math.random() * data.length); // Random selection
      const randomTalk = data[randomIndex];

      // Move the selected talk to the top of the list
      const reorderedTalks = [
        randomTalk,
        ...data.filter((talk) => talk.title !== randomTalk.title),
      ];

      dispatch(setTalks(reorderedTalks)); // Update the state with reordered talks
      dispatch(setSelectedTalk(randomTalk));
      sendTranscriptAsMessage(randomTalk);
    }

    localStorageUtil.setItem('lastSearchData', JSON.stringify(data));
  };

  const sendTranscriptAsMessage = async (talk: Talk) => {
    if (sentMessagesRef.current.has(talk.title)) {
      debugLog(`Message for "${talk.title}" already sent.`);
      return;
    }

    sentMessagesRef.current.add(talk.title);
    const message = `${talk.transcript} —— ${talk.title}\n\n${getSdgTitles(talk.sdg_tags).join(', ')}`;

    dispatch(
      sendMessage({
        persona: talk.presenterDisplayName,
        role: 'bot',
        sender: 'bot',
        text: message,
        hidden: false,
      })
    );
    debugLog(`Sent transcript for "${talk.title}".`);
  };

  const openTranscriptInNewTab = () => {
    if (selectedTalk) {
      debugLog(`Opening transcript for: ${selectedTalk.title}`);
      const tracer = trace.getTracer('tedxsdg-search-frontend');
      tracer.startActiveSpan('open_transcript', (span) => {
        span.setAttribute('video.title', selectedTalk.title);
        span.setAttribute('video.url', selectedTalk.url);
        window.open(`${selectedTalk.url}/transcript?subtitle=en`, '_blank');
        span.end();
      });
    }
  };

  const shuffleTalks = () => {
    debugLog('Shuffling talks.');
    const tracer = trace.getTracer('tedxsdg-search-frontend');
    tracer.startActiveSpan('shuffle_talks', (span) => {
      span.setAttribute('talks.count', talks.length);
      dispatch(setTalks(shuffleArray(talks)));
      span.end();
    });
  };

  return (
    <div className={styles.TalkPanel}>
      {isLoading && <LoadingSpinner />}

      {!isStrictMode.current && selectedTalk && (
        <div className={styles.nowPlaying}>
          <iframe
            src={`https://embed.ted.com/talks/${selectedTalk.url.match(/talks\/([\w_]+)/)?.[1]}`}
            width="100%"
            height="400"
            allow="autoplay; fullscreen; encrypted-media"
            className={styles.videoFrame}
            title={selectedTalk.title}
            onError={() => console.error('Failed to load iframe')}
          />
        </div>
      )}

      <div className={styles.searchContainer}>
        <div className={styles.searchInputWrapper}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && performSearch(searchQuery)}
            className={styles.searchInput}
            placeholder="Search for talks..."
          />
          {isLoading && <LoadingSpinner />}
        </div>
        <button
          onClick={() => performSearch(searchQuery)}
          className={`${styles.button} ${styles.searchButton}`}
          disabled={isLoading}
        >
          Search
        </button>
        <button onClick={shuffleTalks} className={`${styles.button} ${styles.shuffleButton}`}>
          Shuffle
        </button>
        {selectedTalk && (
          <button
            onClick={openTranscriptInNewTab}
            className={`${styles.button} ${styles.tedButton}`}
          >
            Transcript
          </button>
        )}
      </div>

      {error && <div className={styles.errorContainer}>{error}</div>}

      <div className={styles.scrollableContainer} ref={scrollableContainerRef}>
        {talks.map((talk, index) => (
          <TalkItem
            key={`${talk.url}-${index}`}
            talk={talk}
            selected={selectedTalk?.title === talk.title}
          />
        ))}
      </div>
    </div>
  );
};

export default React.memo(TalkPanel);
