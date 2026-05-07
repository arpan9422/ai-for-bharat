import { Router } from 'express';
import {
  bulkUploadLeads,
  createLead,
  listLeads,
  getLeadDetails,
  getAnalytics,
  getCallAudioChunkList,
} from './lead.controller';

const router = Router();

// Analytics
router.get('/analytics', getAnalytics);

// Lead CRUD + upload
router.post('/leads/upload', bulkUploadLeads);   // bulk CSV-style JSON upload
router.post('/leads', createLead);               // single lead
router.get('/leads', listLeads);                 // list with ?status & pagination
router.get('/leads/:id', getLeadDetails);        // detail + call history
router.get('/calls/:callId/audio-chunks', getCallAudioChunkList); // signed chunks in sequence

export default router;
