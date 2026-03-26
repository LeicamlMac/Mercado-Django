import { Request, Response } from 'express';
import { VendaService } from '../services/VendaService';

const vendaService = new VendaService();

export class VendaController {
    async criar(req: Request, res: Response) {
        try {
            const { itens } = req.body;
            if (!itens || itens.length === 0) {
                return res.status(400).json({ error: 'A venda deve conter pelo menos um item.' });
            }
            const novaVenda = await vendaService.registrarVenda(itens);
            return res.status(201).json({
                message: 'Venda registrada com sucesso.',
                venda: novaVenda,
            });
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }
    }
}