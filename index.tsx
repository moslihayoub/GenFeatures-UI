
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

//Vibe coded by ammaar@google.com - Modified by Moslih84

import { GoogleGenAI } from '@google/genai';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import JSZip from 'jszip';

import { Artifact, Session, ComponentVariation, ViewMode, SavedArtifact } from './types.ts';
import { INITIAL_PLACEHOLDERS } from './constants.ts';
import { generateId } from './utils.ts';

import DottedGlowBackground from './components/DottedGlowBackground.tsx';
import ArtifactCard from './components/ArtifactCard.tsx';
import SideDrawer from './components/SideDrawer.tsx';
import { 
    ThinkingIcon, 
    CodeIcon, 
    SparklesIcon, 
    ArrowLeftIcon, 
    ArrowRightIcon, 
    ArrowUpIcon, 
    GridIcon,
    SunIcon,
    MoonIcon,
    HomeIcon,
    StackIcon,
    DownloadIcon,
    BookmarkIcon,
    TrashIcon,
    MaximizeIcon,
    MinimizeIcon
} from './components/Icons.tsx';

const SYSTEM_INSTRUCTION = `
You are a master UI/UX engineer. Your goal is to generate high-fidelity, production-ready UI components using Tailwind CSS.
CRITICAL RULES:
1. ALWAYS use Tailwind 'dark:' utility classes to ensure the component looks great in both Light and Dark modes.
2. Use professional typography (Inter) and modern spacing.
3. Output ONLY the raw HTML/JSX-compatible code. No markdown code fences.
4. Ensure backgrounds use 'bg-white dark:bg-zinc-950' or similar to react to theme changes.
`.trim();

function App() {
  const [view, setView] = useState<ViewMode>('main');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState<number>(-1);
  const [focusedArtifactIndex, setFocusedArtifactIndex] = useState<number | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [savedArtifacts, setSavedArtifacts] = useState<SavedArtifact[]>([]);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  
  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholders, setPlaceholders] = useState<string[]>(INITIAL_PLACEHOLDERS);
  
  const [drawerState, setDrawerState] = useState<{
      isOpen: boolean;
      mode: 'code' | 'variations' | null;
      title: string;
      data: any; 
  }>({ isOpen: false, mode: null, title: '', data: null });

  const [componentVariations, setComponentVariations] = useState<ComponentVariation[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      inputRef.current?.focus();
  }, [view]);

  // Load saved artifacts from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('genfeatures_vault');
    if (saved) {
        try {
            setSavedArtifacts(JSON.parse(saved));
        } catch (e) {
            console.error("Failed to parse vault", e);
        }
    }
  }, []);

  // Sync saved artifacts to localStorage
  useEffect(() => {
    localStorage.setItem('genfeatures_vault', JSON.stringify(savedArtifacts));
  }, [savedArtifacts]);

  // Update document title and body data-theme
  useEffect(() => {
      document.title = "GenFeatures";
      document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // Fix for mobile: reset scroll when focusing an item to prevent "overscroll" state
  useEffect(() => {
    if (focusedArtifactIndex !== null && window.innerWidth <= 1024) {
        if (gridScrollRef.current) {
            gridScrollRef.current.scrollTop = 0;
        }
        window.scrollTo(0, 0);
    }
  }, [focusedArtifactIndex]);

  // Cycle placeholders
  useEffect(() => {
      const interval = setInterval(() => {
          setPlaceholderIndex(prev => (prev + 1) % placeholders.length);
      }, 3000);
      return () => clearInterval(interval);
  }, [placeholders.length]);

  // Dynamic placeholder generation on load
  useEffect(() => {
      const fetchDynamicPlaceholders = async () => {
          try {
              const apiKey = process.env.API_KEY;
              if (!apiKey) return;
              const ai = new GoogleGenAI({ apiKey });
              const response = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: { 
                      role: 'user', 
                      parts: [{ 
                          text: 'Generate 20 creative, short, diverse UI component prompts (e.g. "bioluminescent task list"). Return ONLY a raw JSON array of strings. IP SAFEGUARD: Avoid referencing specific famous artists, movies, or brands.' 
                      }] 
                  }
              });
              const text = response.text || '[]';
              const jsonMatch = text.match(/\[[\s\S]*\]/);
              if (jsonMatch) {
                  const newPlaceholders = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(newPlaceholders) && newPlaceholders.length > 0) {
                      const shuffled = newPlaceholders.sort(() => 0.5 - Math.random()).slice(0, 10);
                      setPlaceholders(prev => [...prev, ...shuffled]);
                  }
              }
          } catch (e) {
              console.warn("Silently failed to fetch dynamic placeholders", e);
          }
      };
      setTimeout(fetchDynamicPlaceholders, 1000);
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const parseJsonStream = async function* (responseStream: AsyncGenerator<{ text: string }>) {
      let buffer = '';
      for await (const chunk of responseStream) {
          const text = chunk.text;
          if (typeof text !== 'string') continue;
          buffer += text;
          let braceCount = 0;
          let start = buffer.indexOf('{');
          while (start !== -1) {
              braceCount = 0;
              let end = -1;
              for (let i = start; i < buffer.length; i++) {
                  if (buffer[i] === '{') braceCount++;
                  else if (buffer[i] === '}') braceCount--;
                  if (braceCount === 0 && i > start) {
                      end = i;
                      break;
                  }
              }
              if (end !== -1) {
                  const jsonString = buffer.substring(start, end + 1);
                  try {
                      yield JSON.parse(jsonString);
                      buffer = buffer.substring(end + 1);
                      start = buffer.indexOf('{');
                  } catch (e) {
                      start = buffer.indexOf('{', start + 1);
                  }
              } else {
                  break; 
              }
          }
      }
  };

  const handleGenerateVariations = useCallback(async () => {
    const currentSession = sessions[currentSessionIndex];
    if (!currentSession || focusedArtifactIndex === null) return;
    const currentArtifact = currentSession.artifacts[focusedArtifactIndex];

    setIsLoading(true);
    setComponentVariations([]);
    setDrawerState({ isOpen: true, mode: 'variations', title: 'Variations', data: currentArtifact.id });

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API_KEY is not configured.");
        const ai = new GoogleGenAI({ apiKey });

        const prompt = `
Generate 3 RADICAL CONCEPTUAL VARIATIONS of: "${currentSession.prompt}".
Ensure all variations are fully adaptive to both Light and Dark modes using Tailwind classes.
Required JSON Output Format (stream ONE object per line):
\`{ "name": "Persona Name", "html": "..." }\`
        `.trim();

        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-3-flash-preview',
             contents: [{ parts: [{ text: prompt }], role: 'user' }],
             config: { temperature: 1.2, systemInstruction: SYSTEM_INSTRUCTION }
        });

        for await (const variation of parseJsonStream(responseStream)) {
            if (variation.name && variation.html) {
                setComponentVariations(prev => [...prev, variation]);
            }
        }
    } catch (e: any) {
        console.error("Error generating variations:", e);
    } finally {
        setIsLoading(false);
    }
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  const applyVariation = (html: string) => {
      if (focusedArtifactIndex === null) return;
      setSessions(prev => prev.map((sess, i) => 
          i === currentSessionIndex ? {
              ...sess,
              artifacts: sess.artifacts.map((art, j) => 
                j === focusedArtifactIndex ? { ...art, html, status: 'complete' } : art
              )
          } : sess
      ));
      setDrawerState(s => ({ ...s, isOpen: false }));
  };

  const handleShowCode = () => {
      const currentSession = sessions[currentSessionIndex];
      if (currentSession && focusedArtifactIndex !== null) {
          const artifact = currentSession.artifacts[focusedArtifactIndex];
          setDrawerState({ isOpen: true, mode: 'code', title: 'Source Code', data: artifact.html });
      }
  };

  const handleDownloadZip = async () => {
    const currentSession = sessions[currentSessionIndex];
    if (!currentSession || focusedArtifactIndex === null) return;
    const artifact = currentSession.artifacts[focusedArtifactIndex];
    
    const zip = new JSZip();
    zip.file("index.html", artifact.html);
    
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `genfeatures-${artifact.id}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveArtifact = () => {
    const currentSession = sessions[currentSessionIndex];
    if (!currentSession || focusedArtifactIndex === null) return;
    const artifact = currentSession.artifacts[focusedArtifactIndex];

    if (savedArtifacts.some(s => s.id === artifact.id)) return;

    const toSave: SavedArtifact = {
        ...artifact,
        prompt: currentSession.prompt,
        savedAt: Date.now()
    };

    setSavedArtifacts(prev => [toSave, ...prev]);
  };

  const handleRemoveFromVault = (id: string) => {
    setSavedArtifacts(prev => prev.filter(s => s.id !== id));
  };

  const handleRestoreFromVault = (saved: SavedArtifact) => {
    const sessionId = generateId();
    const newSession: Session = {
        id: sessionId,
        prompt: saved.prompt,
        timestamp: Date.now(),
        artifacts: [{ ...saved, id: generateId() }]
    };
    setSessions(prev => {
        const next = [...prev, newSession];
        setCurrentSessionIndex(next.length - 1);
        return next;
    });
    setFocusedArtifactIndex(0);
    setView('main');
  };

  const handleGoHome = () => {
    setView('main');
    setSessions([]);
    setCurrentSessionIndex(-1);
    setFocusedArtifactIndex(null);
    setInputValue('');
    setIsFullscreen(false);
  };

  const handleSendMessage = useCallback(async (manualPrompt?: string) => {
    const promptToUse = manualPrompt || inputValue;
    const trimmedInput = promptToUse.trim();
    
    if (!trimmedInput || isLoading) return;
    if (!manualPrompt) setInputValue('');

    setIsLoading(true);
    setView('main');
    const baseTime = Date.now();
    const sessionId = generateId();

    const placeholderArtifacts: Artifact[] = Array(3).fill(null).map((_, i) => ({
        id: `${sessionId}_${i}`,
        styleName: 'Designing...',
        html: '',
        status: 'streaming',
    }));

    const newSession: Session = {
        id: sessionId,
        prompt: trimmedInput,
        timestamp: baseTime,
        artifacts: placeholderArtifacts
    };

    setSessions(prev => [...prev, newSession]);
    setCurrentSessionIndex(sessions.length); 
    setFocusedArtifactIndex(null); 

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API_KEY is not configured.");
        const ai = new GoogleGenAI({ apiKey });

        const stylePrompt = `Generate 3 distinct creative names for UI directions for: "${trimmedInput}". Return JSON array.`;

        const styleResponse = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { role: 'user', parts: [{ text: stylePrompt }] }
        });

        let generatedStyles: string[] = [];
        const styleText = styleResponse.text || '[]';
        const jsonMatch = styleText.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            try {
                generatedStyles = JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.warn("Failed to parse styles, using fallbacks");
            }
        }

        if (!generatedStyles || generatedStyles.length < 3) {
            generatedStyles = ["Modern Minimal", "High-Tech Dark", "Organic Flow"];
        }
        
        generatedStyles = generatedStyles.slice(0, 3);

        setSessions(prev => prev.map(s => {
            if (s.id !== sessionId) return s;
            return {
                ...s,
                artifacts: s.artifacts.map((art, i) => ({
                    ...art,
                    styleName: generatedStyles[i]
                }))
            };
        }));

        const generateArtifact = async (artifact: Artifact, styleInstruction: string) => {
            try {
                const prompt = `Create a high-fidelity HTML/CSS component for: "${trimmedInput}". Direction: ${styleInstruction}. IMPORTANT: Support both light and dark mode using Tailwind classes. NO MARKDOWN FENCES.`;
          
                const responseStream = await ai.models.generateContentStream({
                    model: 'gemini-3-flash-preview',
                    contents: [{ parts: [{ text: prompt }], role: "user" }],
                    config: { systemInstruction: SYSTEM_INSTRUCTION }
                });

                let accumulatedHtml = '';
                for await (const chunk of responseStream) {
                    const text = chunk.text;
                    if (typeof text === 'string') {
                        accumulatedHtml += text;
                        setSessions(prev => prev.map(sess => 
                            sess.id === sessionId ? {
                                ...sess,
                                artifacts: sess.artifacts.map(art => 
                                    art.id === artifact.id ? { ...art, html: accumulatedHtml } : art
                                )
                            } : sess
                        ));
                    }
                }
                
                let finalHtml = accumulatedHtml.trim();
                if (finalHtml.startsWith('```html')) finalHtml = finalHtml.substring(7).trimStart();
                if (finalHtml.startsWith('```')) finalHtml = finalHtml.substring(3).trimStart();
                if (finalHtml.endsWith('```')) finalHtml = finalHtml.substring(0, finalHtml.length - 3).trimEnd();

                setSessions(prev => prev.map(sess => 
                    sess.id === sessionId ? {
                        ...sess,
                        artifacts: sess.artifacts.map(art => 
                            art.id === artifact.id ? { ...art, html: finalHtml, status: finalHtml ? 'complete' : 'error' } : art
                        )
                    } : sess
                ));

            } catch (e: any) {
                console.error('Error generating artifact:', e);
            }
        };

        await Promise.all(placeholderArtifacts.map((art, i) => generateArtifact(art, generatedStyles[i])));

    } catch (e) {
        console.error("Fatal error in generation process", e);
    } finally {
        setIsLoading(false);
    }
  }, [inputValue, isLoading, sessions.length]);

  const handleSurpriseMe = () => {
      const currentPrompt = placeholders[placeholderIndex];
      setInputValue(currentPrompt);
      handleSendMessage(currentPrompt);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      event.preventDefault();
      handleSendMessage();
    } else if (event.key === 'Tab' && !inputValue && !isLoading) {
        event.preventDefault();
        setInputValue(placeholders[placeholderIndex]);
    }
  };

  const nextItem = useCallback(() => {
      if (focusedArtifactIndex !== null) {
          if (focusedArtifactIndex < 2) setFocusedArtifactIndex(focusedArtifactIndex + 1);
      } else {
          if (currentSessionIndex < sessions.length - 1) setCurrentSessionIndex(currentSessionIndex + 1);
      }
  }, [currentSessionIndex, sessions.length, focusedArtifactIndex]);

  const prevItem = useCallback(() => {
      if (focusedArtifactIndex !== null) {
          if (focusedArtifactIndex > 0) setFocusedArtifactIndex(focusedArtifactIndex - 1);
      } else {
           if (currentSessionIndex > 0) setCurrentSessionIndex(currentSessionIndex - 1);
      }
  }, [currentSessionIndex, focusedArtifactIndex]);

  const toggleTheme = () => {
      setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  const hasStarted = sessions.length > 0 || isLoading;
  const currentSession = sessions[currentSessionIndex];

  let canGoBack = false;
  let canGoForward = false;

  if (hasStarted && view === 'main' && !isFullscreen) {
      if (focusedArtifactIndex !== null) {
          canGoBack = focusedArtifactIndex > 0;
          canGoForward = focusedArtifactIndex < (currentSession?.artifacts.length || 0) - 1;
      } else {
          canGoBack = currentSessionIndex > 0;
          canGoForward = currentSessionIndex < sessions.length - 1;
      }
  }

  return (
    <>
        <div className={`top-nav-controls ${isFullscreen ? 'ui-hidden' : ''}`}>
            <button className="nav-icon-btn" onClick={toggleTheme} aria-label="Toggle Theme">
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className={`nav-icon-btn ${view === 'stack' ? 'active' : ''}`} onClick={() => setView(view === 'stack' ? 'main' : 'stack')} title="View Tech Stack">
                <StackIcon />
            </button>
            <button className={`nav-icon-btn ${view === 'vault' ? 'active' : ''}`} onClick={() => setView(view === 'vault' ? 'main' : 'vault')} title="Vault / Moodboard">
                <BookmarkIcon />
            </button>
        </div>

        <a href="https://bento.me/moslih84" target="_blank" rel="noreferrer" className={`creator-credit ${hasStarted ? 'hide-on-mobile' : ''} ${isFullscreen ? 'ui-hidden' : ''}`}>
            created by Moslih84
        </a>

        <SideDrawer 
            isOpen={drawerState.isOpen} 
            onClose={() => setDrawerState(s => ({...s, isOpen: false}))} 
            title={drawerState.title}
        >
            {isLoading && drawerState.mode === 'variations' && componentVariations.length === 0 && (
                 <div className="loading-state">
                     <ThinkingIcon /> 
                     Designing variations...
                 </div>
            )}

            {drawerState.mode === 'code' && (
                <pre className="code-block"><code>{drawerState.data}</code></pre>
            )}
            
            {drawerState.mode === 'variations' && (
                <div className="sexy-grid">
                    {componentVariations.map((v, i) => (
                         <div key={i} className="sexy-card" onClick={() => applyVariation(v.html)}>
                             <div className="sexy-preview">
                                 <iframe srcDoc={v.html} title={v.name} sandbox="allow-scripts allow-same-origin" />
                             </div>
                             <div className="sexy-label">{v.name}</div>
                         </div>
                    ))}
                </div>
            )}
        </SideDrawer>

        <div className="immersive-app">
            <DottedGlowBackground 
                gap={24} 
                radius={1.5} 
                color={theme === 'dark' ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.04)"} 
                glowColor={theme === 'dark' ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)"} 
                speedScale={0.5} 
            />

            {view === 'stack' ? (
                <div className="stack-page">
                    <div className="stack-content">
                        <h1>Project Stack & Flow</h1>
                        
                        <div className="stack-grid">
                            <section className="stack-section">
                                <h3><CodeIcon /> Technologies</h3>
                                <ul>
                                    <li><strong>React 19:</strong> Fast, declarative UI library.</li>
                                    <li><strong>Gemini 3 Flash:</strong> State-of-the-art AI for rapid code generation.</li>
                                    <li><strong>CSS3 Variables:</strong> Dynamic theming and Glassmorphism.</li>
                                    <li><strong>JSZip:</strong> Client-side component export.</li>
                                    <li><strong>Vercel:</strong> High-performance cloud hosting.</li>
                                </ul>
                            </section>

                            <section className="stack-section">
                                <h3><SparklesIcon /> User Flow</h3>
                                <div className="flow-steps">
                                    <div className="flow-item"><span>1</span> Prompt input via natural language</div>
                                    <div className="flow-item"><span>2</span> Style imagination (Gemini direction)</div>
                                    <div className="flow-item"><span>3</span> Parallel component generation</div>
                                    <div className="flow-item"><span>4</span> Live preview and source inspection</div>
                                    <div className="flow-item"><span>5</span> Download as ZIP for local dev</div>
                                </div>
                            </section>
                        </div>

                        <button className="back-btn" onClick={() => setView('main')}>
                            <HomeIcon /> Return Home
                        </button>
                    </div>
                </div>
            ) : view === 'vault' ? (
                <div className="stack-page">
                    <div className="stack-content">
                        <div className="vault-header-mood">
                            <h1>Vault Moodboard</h1>
                            <p>Stored locally in your browser</p>
                        </div>
                        
                        {savedArtifacts.length === 0 ? (
                            <div className="empty-vault-state">
                                <BookmarkIcon />
                                <p>No components saved yet. Star your favorites to see them here.</p>
                                <button className="surprise-button" onClick={() => setView('main')}>Return to Generate</button>
                            </div>
                        ) : (
                            <div className="moodboard-grid">
                                {savedArtifacts.map(saved => (
                                    <div key={saved.id} className="mood-item">
                                        <div className="mood-preview" onClick={() => handleRestoreFromVault(saved)}>
                                            <ArtifactCard 
                                                artifact={saved} 
                                                isFocused={false} 
                                                theme={theme}
                                                onClick={() => {}}
                                            />
                                            <div className="mood-overlay">
                                                <span>Restore</span>
                                            </div>
                                        </div>
                                        <div className="mood-footer">
                                            <div className="mood-info">
                                                <span className="mood-title">{saved.styleName}</span>
                                                <span className="mood-prompt">{saved.prompt}</span>
                                            </div>
                                            <button className="mood-delete" onClick={() => handleRemoveFromVault(saved.id)}>
                                                <TrashIcon />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        
                        <button className="back-btn" onClick={() => setView('main')} style={{ marginTop: '40px' }}>
                            <HomeIcon /> Return Home
                        </button>
                    </div>
                </div>
            ) : (
                <div className={`stage-container ${focusedArtifactIndex !== null ? 'mode-focus' : 'mode-split'} ${isFullscreen ? 'mode-fullscreen' : ''}`}>
                    <div className={`empty-state ${hasStarted ? 'fade-out' : ''}`}>
                        <div className="empty-content">
                            <h1>GenFeatures</h1>
                            <p>Creative UI generation in a flash</p>
                            <button className="surprise-button" onClick={handleSurpriseMe} disabled={isLoading}>
                                <SparklesIcon /> Surprise Me
                            </button>
                        </div>
                    </div>

                    {sessions.map((session, sIndex) => {
                        let positionClass = 'hidden';
                        if (sIndex === currentSessionIndex) positionClass = 'active-session';
                        else if (sIndex < currentSessionIndex) positionClass = 'past-session';
                        else if (sIndex > currentSessionIndex) positionClass = 'future-session';
                        
                        return (
                            <div key={session.id} className={`session-group ${positionClass}`}>
                                <div className="artifact-grid" ref={sIndex === currentSessionIndex ? gridScrollRef : null}>
                                    {session.artifacts.map((artifact, aIndex) => {
                                        const isFocused = focusedArtifactIndex === aIndex;
                                        
                                        return (
                                            <ArtifactCard 
                                                key={artifact.id}
                                                artifact={artifact}
                                                isFocused={isFocused}
                                                theme={theme}
                                                onClick={() => setFocusedArtifactIndex(aIndex)}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

             {canGoBack && (
                <button className="nav-handle left" onClick={prevItem} aria-label="Previous">
                    <ArrowLeftIcon />
                </button>
             )}
             {canGoForward && (
                <button className="nav-handle right" onClick={nextItem} aria-label="Next">
                    <ArrowRightIcon />
                </button>
             )}

            {isFullscreen && (
                <button className="exit-fullscreen-btn" onClick={handleToggleFullscreen} title="Exit Full Screen">
                    <MinimizeIcon /> Exit Full Screen
                </button>
            )}

            <div className={`action-bar ${hasStarted && view === 'main' ? 'visible' : ''} ${isFullscreen ? 'ui-hidden' : ''}`}>
                 <div className="active-prompt-label">
                    {currentSession?.prompt}
                 </div>
                 <div className="action-buttons">
                    <button onClick={handleGoHome}>
                        <HomeIcon /> Home
                    </button>
                    {focusedArtifactIndex !== null ? (
                        <>
                            <button onClick={() => setFocusedArtifactIndex(null)}>
                                <GridIcon /> Grid View
                            </button>
                            <button onClick={handleSaveArtifact} className={savedArtifacts.some(s => s.id === sessions[currentSessionIndex]?.artifacts[focusedArtifactIndex!]?.id) ? 'saved-btn-active' : ''}>
                                <BookmarkIcon /> {savedArtifacts.some(s => s.id === sessions[currentSessionIndex]?.artifacts[focusedArtifactIndex!]?.id) ? 'Saved' : 'Save'}
                            </button>
                            <button onClick={handleGenerateVariations} disabled={isLoading}>
                                <SparklesIcon /> Variations
                            </button>
                            <button onClick={handleShowCode} aria-label="Source Code">
                                <CodeIcon /> Source
                            </button>
                            <button className="download-btn" onClick={handleDownloadZip}>
                                <DownloadIcon /> Download ZIP
                            </button>
                            <button className="fullscreen-btn" onClick={handleToggleFullscreen} title="Full Screen">
                                <MaximizeIcon />
                            </button>
                        </>
                    ) : (
                        <div className="action-hint">Select a variation to edit</div>
                    )}
                 </div>
            </div>

            <div className={`floating-input-container ${view !== 'main' || isFullscreen ? 'hidden' : ''}`}>
                <div className={`input-wrapper ${isLoading ? 'loading' : ''}`}>
                    {(!inputValue && !isLoading) && (
                        <div className="animated-placeholder" key={placeholderIndex}>
                            <span className="placeholder-text">{placeholders[placeholderIndex]}</span>
                            <span className="tab-hint">Tab</span>
                        </div>
                    )}
                    {!isLoading ? (
                        <input 
                            ref={inputRef}
                            type="text" 
                            value={inputValue} 
                            onChange={handleInputChange} 
                            onKeyDown={handleKeyDown} 
                            disabled={isLoading} 
                        />
                    ) : (
                        <div className="input-generating-label">
                            <span className="generating-prompt-text">{currentSession?.prompt}</span>
                            <ThinkingIcon />
                        </div>
                    )}
                    <button className="send-button" onClick={() => handleSendMessage()} disabled={isLoading || !inputValue.trim()}>
                        <ArrowUpIcon />
                    </button>
                </div>
            </div>
        </div>
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
