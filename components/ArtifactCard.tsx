
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import { Artifact } from '../types';

interface ArtifactCardProps {
    artifact: Artifact;
    isFocused: boolean;
    theme: 'light' | 'dark';
    onClick: () => void;
}

const ArtifactCard = React.memo(({ 
    artifact, 
    isFocused, 
    theme,
    onClick 
}: ArtifactCardProps) => {
    const codeRef = useRef<HTMLPreElement>(null);

    // Auto-scroll logic for this specific card
    useEffect(() => {
        if (codeRef.current) {
            codeRef.current.scrollTop = codeRef.current.scrollHeight;
        }
    }, [artifact.html]);

    const wrapInTemplate = (content: string) => {
        return `
            <!DOCTYPE html>
            <html class="${theme === 'dark' ? 'dark' : ''}">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    body { 
                        font-family: 'Inter', sans-serif; 
                        margin: 0; 
                        padding: 20px;
                        background-color: transparent;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    * { transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease; }
                </style>
                <script>
                    tailwind.config = {
                        darkMode: 'class',
                        theme: {
                            extend: {
                                colors: {
                                    zinc: {
                                        950: '#09090b',
                                    }
                                }
                            }
                        }
                    }
                </script>
            </head>
            <body class="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
                ${content}
                <script>
                    // Sync theme if this script is already loaded
                    window.addEventListener('message', (event) => {
                        if (event.data.theme) {
                            document.documentElement.className = event.data.theme === 'dark' ? 'dark' : '';
                        }
                    });
                </script>
            </body>
            </html>
        `;
    };

    const isBlurring = artifact.status === 'streaming';
    const srcDoc = wrapInTemplate(artifact.html);

    return (
        <div 
            className={`artifact-card ${isFocused ? 'focused' : ''} ${isBlurring ? 'generating' : ''}`}
            onClick={onClick}
        >
            <div className="artifact-header">
                <span className="artifact-style-tag">{artifact.styleName}</span>
            </div>
            <div className="artifact-card-inner">
                {isBlurring && (
                    <div className="generating-overlay">
                        <pre ref={codeRef} className="code-stream-preview">
                            {artifact.html}
                        </pre>
                    </div>
                )}
                <iframe 
                    srcDoc={srcDoc} 
                    title={artifact.id} 
                    sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
                    className="artifact-iframe"
                />
            </div>
        </div>
    );
});

export default ArtifactCard;
