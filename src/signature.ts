import { Signature, Encoding } from "autopen";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

export class SignatureManager {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderCanvas: HTMLCanvasElement;
  private renderCtx: CanvasRenderingContext2D;
  private signature: Signature;
  private currentStroke: Array<{ x: number; y: number }> = [];
  private isDrawing = false;

  constructor(canvasId: string, renderCanvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    const renderCanvas = document.getElementById(renderCanvasId) as HTMLCanvasElement | null;

    if (!canvas) {
      throw new Error(`Canvas element '${canvasId}' not found`);
    }
    if (!renderCanvas) {
      throw new Error(`Render canvas element '${renderCanvasId}' not found`);
    }

    this.canvas = canvas;
    this.renderCanvas = renderCanvas;

    const ctx = canvas.getContext("2d");
    const renderCtx = renderCanvas.getContext("2d");

    if (!ctx || !renderCtx) {
      throw new Error("Failed to get 2D context");
    }

    this.ctx = ctx;
    this.renderCtx = renderCtx;

    // Initialize autopen signature
    this.signature = new Signature({
      canvasWidth: CANVAS_WIDTH,
      canvasHeight: CANVAS_HEIGHT,
    });

    // Set up canvas rendering
    this.ctx.strokeStyle = "#000000";
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    // Set up event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Mouse events - listen on document for move/up so strokes continue outside canvas
    this.canvas.addEventListener("mousedown", this.handlePointerDown.bind(this));
    document.addEventListener("mousemove", this.handlePointerMove.bind(this));
    document.addEventListener("mouseup", this.handlePointerUp.bind(this));

    // Touch events - listen on document for move/end so strokes continue outside canvas
    this.canvas.addEventListener("touchstart", this.handleTouchStart.bind(this), {
      passive: false,
    });
    document.addEventListener("touchmove", this.handleTouchMove.bind(this), {
      passive: false,
    });
    document.addEventListener("touchend", this.handleTouchEnd.bind(this), {
      passive: false,
    });
    document.addEventListener("touchcancel", this.handleTouchEnd.bind(this), {
      passive: false,
    });
  }

  private getPointerPosition(e: MouseEvent | Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private handlePointerDown(e: MouseEvent): void {
    e.preventDefault();
    this.isDrawing = true;
    const pos = this.getPointerPosition(e);
    this.currentStroke = [pos];

    this.ctx.beginPath();
    this.ctx.moveTo(pos.x, pos.y);
  }

  private handlePointerMove(e: MouseEvent): void {
    if (!this.isDrawing) return;
    e.preventDefault();

    const pos = this.getPointerPosition(e);
    this.currentStroke.push(pos);

    // Draw on canvas
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
  }

  private handlePointerUp(e: MouseEvent): void {
    if (!this.isDrawing) return;
    e.preventDefault();

    this.isDrawing = false;

    // Add stroke to signature if it has points
    if (this.currentStroke.length > 0) {
      this.signature.pushStroke(this.currentStroke);
      this.currentStroke = [];

      // Clear drawing canvas and render to render canvas
      this.clearCanvas();
      this.renderToCanvas();

      // Dispatch change event for form state management
      this.canvas.dispatchEvent(new Event("signaturechange", { bubbles: true }));
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 1) {
      this.isDrawing = true;
      const pos = this.getPointerPosition(e.touches[0]);
      this.currentStroke = [pos];

      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.isDrawing || e.touches.length !== 1) return;
    e.preventDefault();

    const pos = this.getPointerPosition(e.touches[0]);
    this.currentStroke.push(pos);

    // Draw on canvas
    this.ctx.lineTo(pos.x, pos.y);
    this.ctx.stroke();
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (!this.isDrawing) return;
    e.preventDefault();

    this.isDrawing = false;

    // Add stroke to signature if it has points
    if (this.currentStroke.length > 0) {
      this.signature.pushStroke(this.currentStroke);
      this.currentStroke = [];

      // Clear drawing canvas and render to render canvas
      this.clearCanvas();
      this.renderToCanvas();

      // Dispatch change event for form state management
      this.canvas.dispatchEvent(new Event("signaturechange", { bubbles: true }));
    }
  }

  private clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private renderToCanvas(): void {
    // Clear the render canvas
    this.renderCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (this.signature.isEmpty()) {
      return;
    }

    // Get simplified strokes and draw them with splines
    const strokes = this.signature.getStrokes();
    this.renderCtx.strokeStyle = "#000000";
    this.renderCtx.lineWidth = 2;
    this.renderCtx.lineCap = "round";
    this.renderCtx.lineJoin = "round";

    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      if (stroke.length === 1) {
        // Single point - just draw a dot
        this.renderCtx.beginPath();
        this.renderCtx.arc(stroke[0].x, stroke[0].y, 1, 0, 2 * Math.PI);
        this.renderCtx.fill();
        continue;
      }

      // Draw Catmull-Rom spline with tension 0.5
      this.renderCtx.beginPath();
      this.renderCtx.moveTo(stroke[0].x, stroke[0].y);

      if (stroke.length === 2) {
        // Two points - just draw a line
        this.renderCtx.lineTo(stroke[1].x, stroke[1].y);
      } else {
        // Three or more points - draw spline
        this.drawCatmullRomSpline(stroke, 0.5);
      }

      this.renderCtx.stroke();
    }
  }

  private drawCatmullRomSpline(points: Array<{ x: number; y: number }>, tension: number): void {
    const segments = 16; // Number of segments between each pair of points

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : p2;

      for (let t = 0; t <= segments; t++) {
        const t_norm = t / segments;
        const t2 = t_norm * t_norm;
        const t3 = t2 * t_norm;

        // Catmull-Rom matrix coefficients
        const c0 = -tension * t3 + 2 * tension * t2 - tension * t_norm;
        const c1 = (2 - tension) * t3 + (tension - 3) * t2 + 1;
        const c2 = (tension - 2) * t3 + (3 - 2 * tension) * t2 + tension * t_norm;
        const c3 = tension * t3 - tension * t2;

        const x = c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x;
        const y = c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y;

        this.renderCtx.lineTo(x, y);
      }
    }
  }

  /**
   * Undo the last stroke
   */
  public undo(): void {
    const removed = this.signature.popStroke();
    if (removed) {
      this.renderToCanvas();
      this.canvas.dispatchEvent(new Event("signaturechange", { bubbles: true }));
    }
  }

  /**
   * Clear all strokes
   */
  public clear(): void {
    this.signature.clear();
    this.clearCanvas();
    this.renderToCanvas();
    this.canvas.dispatchEvent(new Event("signaturechange", { bubbles: true }));
  }

  /**
   * Serialize signature to Z85 string
   */
  public serialize(): string | null {
    if (this.signature.isEmpty()) {
      return null;
    }
    return this.signature.serializeToString(Encoding.Z85);
  }

  /**
   * Deserialize signature from Z85 string
   */
  public deserialize(z85: string | null): void {
    if (!z85) {
      this.clear();
      return;
    }

    try {
      this.signature = Signature.deserializeFromString(z85, Encoding.Z85, {
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
      });
      this.renderToCanvas();
    } catch (error) {
      console.error("Failed to deserialize signature:", error);
      this.clear();
    }
  }

  /**
   * Check if signature is empty
   */
  public isEmpty(): boolean {
    return this.signature.isEmpty();
  }

  /**
   * Get the underlying autopen Signature object (for PDF rendering)
   */
  public getSignature(): Signature {
    return this.signature;
  }

  /**
   * Get the render canvas (for PDF embedding)
   */
  public getRenderCanvas(): HTMLCanvasElement {
    return this.renderCanvas;
  }
}
