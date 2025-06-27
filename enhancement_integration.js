        // Step 2.5: RECOMMENDATION ENHANCEMENT PHASE
        console.log("🎯 === RECOMMENDATION ENHANCEMENT PHASE ===");
        const enhancer = new RecommendationEnhancer();
        
        if (enhancer.enabled) {
            console.log(`📊 Processing enhancement for ${allEvents.length} validated events`);
            const eventsNeedingEnhancement = allEvents.filter(event => enhancer.needsEnhancement(event));
            console.log(`🎯 Found ${eventsNeedingEnhancement.length} events needing enhancement out of ${allEvents.length} total`);
            
            const batchSize = parseInt(process.env.ENHANCEMENT_BATCH_SIZE) || 50;
            const eventsToProcess = eventsNeedingEnhancement.slice(0, batchSize);
            console.log(`🎯 Processing enhancement for ${eventsToProcess.length} events (limited for performance)`);
            
            let enhancementSuccessCount = 0;
            for (const event of eventsToProcess) {
                try {
                    const enhanced = await enhancer.enhanceEvent(event);
                    if (enhanced.enhancementProcessed) {
                        enhancementSuccessCount++;
                        const eventIndex = allEvents.findIndex(e => e._id?.toString() === event._id?.toString() || e.sourceId === event.sourceId);
                        if (eventIndex !== -1) {
                            allEvents[eventIndex] = enhanced;
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️ Enhancement failed for event ${event.name}:`, error.message);
                }
            }
            
            console.log(`✅ Recommendation Enhancement completed: ${enhancementSuccessCount}/${eventsToProcess.length} events successfully enhanced`);
        } else {
            console.log("⏸️ Recommendation Enhancement disabled (RECOMMENDATION_ENHANCEMENT_ENABLED=false)");
        }
