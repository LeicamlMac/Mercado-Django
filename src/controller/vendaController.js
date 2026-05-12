const vendaModel = require('../model/vendaModel');

const registrarVenda = async (req, res) => {

    try {

        const { itens } = req.body;

        if (!itens || itens.length === 0) {

            return res.status(400).json({
                erro: 'Nenhum item enviado'
            });

        }

        let total = 0;

        for (const item of itens) {

            total += item.quantidade * item.preco;

        }

        const venda = await vendaModel.criarVenda(total);

        for (const item of itens) {

            await vendaModel.criarItemVenda(
                venda.id,
                item.produto_id,
                item.quantidade,
                item.preco
            );

        }

        res.status(201).json({
            mensagem: 'Venda registrada com sucesso',
            venda
        });

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

const listarVendas = async (req, res) => {

    try {

        const vendas = await vendaModel.listarVendas();

        res.status(200).json(vendas);

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

    }
};

module.exports = {
    registrarVenda,
    listarVendas
};