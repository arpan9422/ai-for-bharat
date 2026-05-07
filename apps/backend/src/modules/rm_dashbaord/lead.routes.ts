import { Router, Request, Response } from 'express';
import {
  bulkUploadLeads,
  createLead,
  listLeads,
  getLeadDetails,
  getAnalytics,
} from './lead.controller';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Analytics
router.get('/analytics', getAnalytics);

// Lead CRUD + upload
router.post('/leads/upload', bulkUploadLeads);
router.post('/leads', createLead);
router.get('/leads', listLeads);
router.get('/leads/:id', getLeadDetails);

// WhatsApp — mark as sent
router.post('/whatsapp/:id/send', async (req: Request, res: Response) => {
  try {
    const log = await prisma.whatsappLog.update({
      where: { id: req.params.id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    res.json({ success: true, log });
  } catch (err) {
    res.status(404).json({ error: 'WhatsApp log not found' });
  }
});

// WhatsApp — get pending messages for a lead
router.get('/leads/:id/whatsapp', async (req: Request, res: Response) => {
  try {
    const logs = await prisma.whatsappLog.findMany({
      where: { leadId: req.params.id },
      orderBy: { sentAt: 'desc' },
    });
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch WhatsApp logs' });
  }
});

export default router;
