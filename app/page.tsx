"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Game, Difficulty, GameState } from "@/lib/game";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [gameState, setGameState] = useState<GameState>("title");
  const [orientationPermission, setOrientationPermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");

  // Initialize game engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Game(canvas);
    gameRef.current = game;
    game.onStateChange = setGameState;
    game.start();

    // Resize handler
    const onResize = () => game.resize();
    window.addEventListener("resize", onResize);

    // Keyboard controls
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        game.handleKeyboard(e.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Prevent pull-to-refresh / scroll on the canvas only (not buttons)
    const preventTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };
    canvas.addEventListener("touchmove", preventTouchMove, { passive: false });

    // Touch controls on canvas
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (game.state === "playing" && e.touches.length > 0) {
        game.handleTouchStart(e.touches[0].clientX);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (game.state === "playing" && e.touches.length > 0) {
        game.handleTouchMove(e.touches[0].clientX);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      game.handleTouchEnd();
    };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("touchmove", preventTouchMove);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Device orientation
  const requestOrientation = useCallback(async () => {
    const game = gameRef.current;
    if (!game) return;

    // Check if DeviceOrientationEvent is available
    if (!("DeviceOrientationEvent" in window)) {
      setOrientationPermission("denied");
      return;
    }

    // iOS 13+ requires permission
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm === "granted") {
          setOrientationPermission("granted");
          setupOrientationListener(game);
        } else {
          setOrientationPermission("denied");
        }
      } catch {
        setOrientationPermission("denied");
      }
    } else {
      // Non-iOS or older browsers - just try it
      setOrientationPermission("granted");
      setupOrientationListener(game);
    }
  }, []);

  function setupOrientationListener(game: Game) {
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && game.state === "playing") {
        game.handleTilt(e.gamma);
      }
    };
    window.addEventListener("deviceorientation", onOrientation);
  }

  const startGame = useCallback(
    (difficulty: Difficulty) => {
      const game = gameRef.current;
      if (!game) return;

      // Request orientation permission on first play if not yet done
      if (orientationPermission === "unknown") {
        requestOrientation();
      }

      game.startGame(difficulty);
    },
    [orientationPermission, requestOrientation]
  );

  const playAgain = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.startGame(game.difficulty);
  }, []);

  const goToMenu = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    game.goToTitle();
  }, []);

  return (
    <div
      style={{
        width: "100dvw",
        height: "100dvh",
        position: "relative",
        overflow: "hidden",
        background: "#0A1628",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />

      {/* Title screen buttons */}
      {gameState === "title" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            paddingTop: "8%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              pointerEvents: "auto",
            }}
          >
            <button onTouchEnd={(e) => { e.preventDefault(); startGame("easy"); }} onClick={() => startGame("easy")} style={buttonStyle("#2ECC71")}>
              Easy
            </button>
            <button onTouchEnd={(e) => { e.preventDefault(); startGame("medium"); }} onClick={() => startGame("medium")} style={buttonStyle("#F39C12")}>
              Medium
            </button>
            <button onTouchEnd={(e) => { e.preventDefault(); startGame("hard"); }} onClick={() => startGame("hard")} style={buttonStyle("#E74C3C")}>
              Hard
            </button>
          </div>
          <p
            style={{
              color: "rgba(200, 220, 240, 0.5)",
              fontSize: 13,
              marginTop: 24,
              pointerEvents: "none",
            }}
          >
            Tilt phone or drag to steer
          </p>
        </div>
      )}

      {/* Game over buttons */}
      {gameState === "gameover" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            paddingTop: "20%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              pointerEvents: "auto",
              marginTop: 60,
            }}
          >
            <button onTouchEnd={(e) => { e.preventDefault(); playAgain(); }} onClick={playAgain} style={buttonStyle("#2ECC71")}>
              Play Again
            </button>
            <button onTouchEnd={(e) => { e.preventDefault(); goToMenu(); }} onClick={goToMenu} style={buttonStyle("#5B7FA5")}>
              Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function buttonStyle(color: string): React.CSSProperties {
  return {
    background: color,
    color: "#FFFFFF",
    border: "none",
    borderRadius: 12,
    padding: "14px 48px",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    minWidth: 180,
    textAlign: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    WebkitTapHighlightColor: "transparent",
  };
}
