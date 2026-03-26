import { Request, Response } from 'express';
import { DespesaService } from '../services/DespesaService';

const despesaService = new DespesaService();

export class DespesaController {
    async criar(req: Request, res: Response) {
        try {
            const { descricao, valor, tipo, status } = req.body;
            const novaDespesa = await despesaService.registrarDespesa({ descricao, valor, tipo, status });
            return res.status(201).json({
                message: 'Despesa registrada com sucesso.',
                despesa: novaDespesa,
            });
        } catch (error) {
            return res.status(400).json({ error: 'Erro ao registrar despesa.' });
        }
    }
}