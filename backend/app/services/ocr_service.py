"""
OCR Service for Spellbook v2.0

Optical Character Recognition service for extracting text from card images.
Uses Tesseract OCR with pre-processing optimizations for MTG cards.
"""

import asyncio
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from typing import Optional, Tuple, List, Dict, Any

import cv2
import numpy as np
from PIL import Image

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    pytesseract = None

from app.config import settings

logger = logging.getLogger(__name__)

# Thread pool for CPU-intensive operations
_executor = ThreadPoolExecutor(max_workers=settings.OCR_WORKER_THREADS)


class OCRService:
    """
    OCR service optimized for Magic: The Gathering cards.
    
    Features:
    - Card region detection
    - Text extraction from name, type line, and set info
    - Pre-processing for improved accuracy
    - Support for various card orientations
    """
    
    def __init__(self):
        self.tesseract_config = '--oem 3 --psm 7'  # Single line mode
        self.tesseract_lang = 'eng'
        
        # Card regions (relative positions for standard MTG card)
        # Values are (x%, y%, width%, height%) of card area
        self.regions = {
            'name': (0.05, 0.03, 0.75, 0.08),      # Card name at top
            'type_line': (0.05, 0.56, 0.90, 0.06),  # Type line in middle
            'set_code': (0.85, 0.93, 0.12, 0.05),   # Set code bottom right
            'collector_number': (0.05, 0.93, 0.15, 0.05),  # Collector number bottom left
        }
        
        if not TESSERACT_AVAILABLE:
            logger.warning("Tesseract not available. OCR will be limited.")
    
    async def extract_card_text(self, image_data: bytes) -> Dict[str, Any]:
        """
        Extract text from a card image.
        
        Args:
            image_data: Raw image bytes
            
        Returns:
            Dict containing extracted text and confidence scores
        """
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            self._extract_card_text_sync,
            image_data
        )
        return result
    
    def _extract_card_text_sync(self, image_data: bytes) -> Dict[str, Any]:
        """Synchronous implementation of text extraction"""
        result = {
            'name': None,
            'type_line': None,
            'set_code': None,
            'collector_number': None,
            'raw_text': None,
            'confidence': 0.0,
            'regions': {}
        }
        
        try:
            # Load image
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                logger.error("Failed to decode image")
                return result
            
            # Detect card region
            card_region = self._detect_card_region(image)
            if card_region is not None:
                image = card_region
            
            # Pre-process for OCR
            processed = self._preprocess_for_ocr(image)
            
            # Extract text from each region
            height, width = processed.shape[:2]
            
            for region_name, (rx, ry, rw, rh) in self.regions.items():
                x = int(width * rx)
                y = int(height * ry)
                w = int(width * rw)
                h = int(height * rh)
                
                # Ensure valid region
                x = max(0, min(x, width - 1))
                y = max(0, min(y, height - 1))
                w = min(w, width - x)
                h = min(h, height - y)
                
                if w > 10 and h > 10:
                    region_img = processed[y:y+h, x:x+w]
                    text, conf = self._ocr_region(region_img)
                    
                    if text:
                        result[region_name] = text
                        result['regions'][region_name] = {
                            'text': text,
                            'confidence': conf,
                            'bbox': {'x': x, 'y': y, 'width': w, 'height': h}
                        }
            
            # Get full text for fallback matching
            if TESSERACT_AVAILABLE:
                full_text = pytesseract.image_to_string(processed, lang=self.tesseract_lang)
                result['raw_text'] = full_text.strip()
            
            # Calculate overall confidence
            confidences = [r['confidence'] for r in result['regions'].values() if r.get('confidence', 0) > 0]
            result['confidence'] = sum(confidences) / len(confidences) if confidences else 0.0
            
        except Exception as e:
            logger.error(f"OCR extraction failed: {e}")
        
        return result
    
    async def detect_card_bounds(self, image_data: bytes) -> Optional[Dict[str, int]]:
        """
        Detect the bounding box of a card in an image.
        
        Args:
            image_data: Raw image bytes
            
        Returns:
            Dict with x, y, width, height or None if not found
        """
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            _executor,
            self._detect_card_bounds_sync,
            image_data
        )
        return result
    
    def _detect_card_bounds_sync(self, image_data: bytes) -> Optional[Dict[str, int]]:
        """Synchronous card detection"""
        try:
            nparr = np.frombuffer(image_data, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                return None
            
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Apply edge detection
            edges = cv2.Canny(gray, 50, 150)
            
            # Find contours
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            # Find the largest rectangular contour (likely the card)
            best_rect = None
            best_area = 0
            
            for contour in contours:
                # Approximate the contour
                peri = cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
                
                # Check if it's roughly rectangular (4 corners)
                if len(approx) == 4:
                    area = cv2.contourArea(contour)
                    if area > best_area and area > 1000:  # Minimum size threshold
                        # Check aspect ratio (cards are ~2.5:3.5)
                        x, y, w, h = cv2.boundingRect(approx)
                        aspect = w / h if h > 0 else 0
                        if 0.5 < aspect < 1.0:  # Valid card aspect ratio
                            best_area = area
                            best_rect = (x, y, w, h)
            
            if best_rect:
                x, y, w, h = best_rect
                return {'x': x, 'y': y, 'width': w, 'height': h}
            
        except Exception as e:
            logger.error(f"Card detection failed: {e}")
        
        return None
    
    def _detect_card_region(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Detect and extract the card region from an image.
        
        Args:
            image: OpenCV image array
            
        Returns:
            Cropped card region or None
        """
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if not contours:
                return None
            
            # Find largest contour by area
            largest = max(contours, key=cv2.contourArea)
            
            # Get bounding rectangle
            x, y, w, h = cv2.boundingRect(largest)
            
            # Add small margin
            margin = 5
            x = max(0, x - margin)
            y = max(0, y - margin)
            w = min(image.shape[1] - x, w + 2 * margin)
            h = min(image.shape[0] - y, h + 2 * margin)
            
            return image[y:y+h, x:x+w]
            
        except Exception as e:
            logger.debug(f"Card region detection failed: {e}")
            return None
    
    def _preprocess_for_ocr(self, image: np.ndarray) -> np.ndarray:
        """
        Pre-process image for better OCR results.
        
        Args:
            image: OpenCV image array
            
        Returns:
            Processed image
        """
        # Convert to grayscale if needed
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        # Resize if too small
        height, width = gray.shape
        if width < 400:
            scale = 400 / width
            gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        
        # Apply adaptive thresholding
        gray = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        # Denoise
        gray = cv2.medianBlur(gray, 3)
        
        return gray
    
    def _ocr_region(self, region: np.ndarray) -> Tuple[Optional[str], float]:
        """
        Perform OCR on a specific region.
        
        Args:
            region: Image region to OCR
            
        Returns:
            Tuple of (extracted text, confidence)
        """
        if not TESSERACT_AVAILABLE:
            return None, 0.0
        
        try:
            # Get OCR data with confidence
            data = pytesseract.image_to_data(
                region, 
                lang=self.tesseract_lang, 
                config=self.tesseract_config,
                output_type=pytesseract.Output.DICT
            )
            
            # Extract text and calculate average confidence
            texts = []
            confidences = []
            
            for i, conf in enumerate(data['conf']):
                if conf > 0:
                    text = data['text'][i].strip()
                    if text:
                        texts.append(text)
                        confidences.append(conf)
            
            if texts:
                full_text = ' '.join(texts)
                avg_conf = sum(confidences) / len(confidences) / 100  # Normalize to 0-1
                return full_text, avg_conf
            
        except Exception as e:
            logger.debug(f"Region OCR failed: {e}")
        
        return None, 0.0
    
    def clean_card_name(self, text: Optional[str]) -> Optional[str]:
        """
        Clean and normalize a card name.
        
        Args:
            text: Raw OCR text
            
        Returns:
            Cleaned card name
        """
        if not text:
            return None
        
        # Remove common OCR artifacts
        text = text.strip()
        text = re.sub(r'[^\w\s\',\-]', '', text)
        text = re.sub(r'\s+', ' ', text)
        
        # Capitalize properly
        text = text.title()
        
        return text if len(text) >= 2 else None
    
    def extract_set_info(self, text: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract set code and collector number from text.
        
        Args:
            text: Raw OCR text from set region
            
        Returns:
            Tuple of (set_code, collector_number)
        """
        if not text:
            return None, None
        
        # Common patterns: "123/456", "123", "SET 123"
        set_code = None
        collector_num = None
        
        # Look for collector number pattern
        num_match = re.search(r'(\d+)(?:/\d+)?', text)
        if num_match:
            collector_num = num_match.group(1)
        
        # Look for set code (3-4 uppercase letters)
        set_match = re.search(r'([A-Z]{3,4})', text.upper())
        if set_match:
            set_code = set_match.group(1)
        
        return set_code, collector_num


# Global service instance
ocr_service = OCRService()
