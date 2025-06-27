// lib/ocrUtils.js - Minimal OCR Utility for Festival Lineup Extraction
// SURGICAL ADDITION: Memory-optimized for Basic dyno (512MB)

const crypto = require('crypto');

/**
 * Minimal OCR processor optimized for Basic Heroku dyno
 * Focuses on festival lineup extraction with memory constraints
 */
class MinimalOCR {
  constructor() {
    this.enabled = process.env.OCR_ENABLED === 'true';
    this.tesseract = null; // Lazy load only when needed
    this.processedCount = 0;
    this.successCount = 0;
    
    // Configuration optimized for Basic dyno
    this.config = {
      maxProcessingTime: 30000, // 30 seconds per image
      maxImageSize: 2000000, // 2MB max image size
      minImageDimensions: { width: 300, height: 200 },
      maxArtists: 15, // Limit extracted artists
      memoryCleanupInterval: 5 // Clean up every 5 events
    };
  }

  /**
   * SURGICAL: Check if event needs OCR processing
   * Only process events that actually need it
   */
  needsOCR(event) {
    // Must have missing or empty artist data
    const hasNoArtists = !event.artists || event.artists.length === 0;
    const hasNoArtistList = !event.artistList || event.artistList.length === 0;
    
    if (!hasNoArtists && !hasNoArtistList) {
      return false; // Already has artist data
    }

    // Must have images
    const hasImages = event.images && event.images.length > 0;
    if (!hasImages) return false;

    // Must not be already processed
    if (event.ocrProcessed || event.ocrSkipped) return false;

    // Must have valid images for OCR
    const hasValidImages = event.images.some(img => this.isValidImage(img));
    return hasValidImages;
  }

  /**
   * SURGICAL: Validate image for OCR processing
   */
  isValidImage(image) {
    if (!image || !image.url) return false;
    
    // Check image format
    const url = image.url.toLowerCase();
    const validFormats = ['.jpg', '.jpeg', '.png', '.webp'];
    const hasValidFormat = validFormats.some(format => url.includes(format));
    
    if (!hasValidFormat) return false;

    // Check dimensions if available
    if (image.width && image.height) {
      const { minImageDimensions } = this.config;
      if (image.width < minImageDimensions.width || image.height < minImageDimensions.height) {
        return false;
      }
    }

    return true;
  }

  /**
   * SURGICAL: Select best image for OCR processing
   */
  selectBestImage(images) {
    const validImages = images.filter(img => this.isValidImage(img));
    if (validImages.length === 0) return null;

    // Prefer larger images (more text detail)
    return validImages.reduce((best, current) => {
      const bestSize = (best.width || 800) * (best.height || 600);
      const currentSize = (current.width || 800) * (current.height || 600);
      return currentSize > bestSize ? current : best;
    });
  }

  /**
   * SURGICAL: Main OCR processing function
   * Memory-optimized for Basic dyno
   */
  async processEvent(event) {
    if (!this.enabled) {
      return { ...event, ocrSkipped: true, ocrReason: 'OCR disabled' };
    }

    if (!this.needsOCR(event)) {
      return { ...event, ocrSkipped: true, ocrReason: 'Event does not need OCR' };
    }

    this.processedCount++;
    
    try {
      // Lazy load Tesseract only when needed
      if (!this.tesseract) {
        console.log('🔧 Loading Tesseract OCR engine...');
        this.tesseract = require('tesseract.js');
      }

      const bestImage = this.selectBestImage(event.images);
      if (!bestImage) {
        return { ...event, ocrSkipped: true, ocrReason: 'No suitable image found' };
      }

      console.log(`🖼️ Processing OCR for: ${event.name} (${bestImage.url})`);
      
      // Create worker with timeout
      const startTime = Date.now();
      
      const { data } = await Promise.race([
        this.tesseract.recognize(bestImage.url, 'eng', {
          logger: m => {
            if (m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              if (progress % 25 === 0) { // Log every 25%
                console.log(`📝 OCR Progress: ${progress}%`);
              }
            }
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('OCR timeout')), this.config.maxProcessingTime)
        )
      ]);

      const processingTime = Date.now() - startTime;
      
      // Extract artist names from OCR text
      const extractedArtists = this.extractArtistNames(data.text, data.confidence);
      
      if (extractedArtists.length > 0) {
        this.successCount++;
        console.log(`✅ OCR success for ${event.name}: ${extractedArtists.length} artists (${Math.round(processingTime/1000)}s)`);
        
        // Merge with existing artists (preserve original data)
        const originalArtists = event.artists || [];
        const allArtists = [...originalArtists, ...extractedArtists];
        const uniqueArtists = [...new Set(allArtists.map(a => typeof a === 'string' ? a : a.name))];
        
        return {
          ...event,
          ocrProcessed: true,
          ocrResults: {
            artists: extractedArtists,
            confidence: data.confidence / 100, // Convert to 0-1 scale
            processingTime,
            imageUrl: bestImage.url,
            processedAt: new Date()
          },
          artists: uniqueArtists.map(name => ({ name, id: '', url: '', image: '' })),
          artistList: uniqueArtists
        };
      } else {
        console.log(`⚠️ OCR completed but no artists found for ${event.name}`);
        return {
          ...event,
          ocrProcessed: true,
          ocrResults: {
            artists: [],
            confidence: data.confidence / 100,
            processingTime,
            imageUrl: bestImage.url,
            processedAt: new Date()
          }
        };
      }

    } catch (error) {
      console.warn(`❌ OCR failed for ${event.name}:`, error.message);
      return {
        ...event,
        ocrProcessed: false,
        ocrError: error.message,
        ocrAttemptedAt: new Date()
      };
    } finally {
      // Memory cleanup every few events
      if (this.processedCount % this.config.memoryCleanupInterval === 0) {
        if (global.gc) {
          global.gc();
        }
      }
    }
  }

  /**
   * SURGICAL: Extract artist names from OCR text
   * Simple pattern matching optimized for festival posters
   */
  extractArtistNames(text, confidence) {
    if (!text || confidence < 60) { // Minimum confidence threshold
      return [];
    }

    console.log(`📝 Extracting artists from OCR text (${text.length} chars, ${Math.round(confidence)}% confidence)`);

    // Split text into lines and clean
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 1);

    const potentialArtists = new Set();

    // Strategy 1: Look for capitalized phrases (artist names are usually capitalized)
    lines.forEach(line => {
      // Match sequences of capitalized words
      const capitalizedMatches = line.match(/\b[A-Z][A-Z\s&]+\b/g);
      if (capitalizedMatches) {
        capitalizedMatches.forEach(match => {
          const cleaned = match.trim();
          if (cleaned.length >= 3 && cleaned.length <= 40) {
            potentialArtists.add(cleaned);
          }
        });
      }
    });

    // Strategy 2: Look for quoted artist names
    const quotedMatches = text.match(/["']([^"']+)["']/g);
    if (quotedMatches) {
      quotedMatches.forEach(match => {
        const artist = match.replace(/["']/g, '').trim();
        if (artist.length >= 3 && artist.length <= 40) {
          potentialArtists.add(artist);
        }
      });
    }

    // Filter and validate artist names
    const validArtists = Array.from(potentialArtists)
      .map(artist => this.cleanArtistName(artist))
      .filter(artist => this.isValidArtistName(artist))
      .slice(0, this.config.maxArtists);

    console.log(`🎵 Extracted ${validArtists.length} potential artists: ${validArtists.slice(0, 3).join(', ')}${validArtists.length > 3 ? '...' : ''}`);
    return validArtists;
  }

  /**
   * SURGICAL: Clean artist name
   */
  cleanArtistName(name) {
    return name
      .replace(/[^\w\s&.-]/g, '') // Remove special characters except &, ., -
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .toUpperCase(); // Normalize to uppercase
  }

  /**
   * SURGICAL: Validate artist name
   */
  isValidArtistName(name) {
    if (!name || name.length < 2 || name.length > 40) return false;
    
    // Filter out common non-artist words
    const commonWords = ['AND', 'THE', 'WITH', 'FEAT', 'FEATURING', 'VS', 'PRESENTS', 'LIVE', 'SHOW', 'EVENT', 'FESTIVAL', 'MUSIC'];
    if (commonWords.includes(name)) return false;
    
    // Filter out dates, times, prices
    if (/^\d+$/.test(name)) return false; // Pure numbers
    if (/\$\d+/.test(name)) return false; // Prices
    if (/\d{1,2}:\d{2}/.test(name)) return false; // Times
    if (/\d{1,2}\/\d{1,2}/.test(name)) return false; // Dates
    
    // Must have at least one letter
    if (!/[A-Za-z]/.test(name)) return false;
    
    return true;
  }

  /**
   * SURGICAL: Get processing statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      processed: this.processedCount,
      successful: this.successCount,
      successRate: this.processedCount > 0 ? Math.round((this.successCount / this.processedCount) * 100) : 0
    };
  }

  /**
   * SURGICAL: Cleanup resources
   */
  cleanup() {
    if (this.tesseract) {
      // Tesseract.js doesn't require explicit cleanup in newer versions
      this.tesseract = null;
    }
    
    if (global.gc) {
      global.gc();
    }
  }
}

/**
 * SURGICAL: Convenience function for batch processing
 * Processes multiple events with memory management
 */
async function enhanceEventsWithOCR(events) {
  if (!events || events.length === 0) return events;
  
  const ocr = new MinimalOCR();
  
  if (!ocr.enabled) {
    console.log('⏭️ OCR processing disabled');
    return events;
  }

  console.log(`🖼️ Starting OCR enhancement for ${events.length} events`);
  
  const enhancedEvents = [];
  
  for (let i = 0; i < events.length; i++) {
    try {
      const enhancedEvent = await ocr.processEvent(events[i]);
      enhancedEvents.push(enhancedEvent);
      
      // Small delay between events to prevent memory pressure
      if (i < events.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`❌ OCR enhancement failed for event ${i}:`, error.message);
      enhancedEvents.push({
        ...events[i],
        ocrProcessed: false,
        ocrError: error.message
      });
    }
  }
  
  const stats = ocr.getStats();
  console.log(`✅ OCR enhancement completed: ${stats.successful}/${stats.processed} events successful (${stats.successRate}%)`);
  
  // Cleanup resources
  ocr.cleanup();
  
  return enhancedEvents;
}

module.exports = {
  MinimalOCR,
  enhanceEventsWithOCR
};
