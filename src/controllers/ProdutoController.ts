import {Request, Response} from 'express';
import {ProdutoService} from '../services/ProdutoService';

const produtoService = new ProdutoService();

export class ProdutoController {
    async criarProduto(req: Request, res: Response) {
        try {
            const { nome, precoVenda, quantidadeEstoque, categoriaId } = req.body;
            if (!nome || precoVenda === undefined || quantidadeEstoque === undefined || !categoriaId) {
                return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
            }
            const novoProduto = await produtoService.criarProduto({
                nome,
                precoVenda,
                quantidadeEstoque,
                categoriaId 
            });

            return res.status(201).json({
                message: 'Produto criado com sucesso.',
                produto: novoProduto,
            });
        } catch (error: any) {
            return res.status(400).json({ erro: error.message });
        }
    }

    async listarProdutos(req: Request, res: Response) {
        try {
            const produtos = await produtoService.listarProdutos();
            return res.status(200).json(produtos);
        } catch (error: any) {
            return res.status(500).json({ error: 'Erro ao listar produtos.' });
        }
    }
}