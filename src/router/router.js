const express = require('express');

const router = express.Router();

const prodController = require('../controller/prodController');
const categoriaController = require('../controller/categoriaController');
const vendaController = require('../controller/vendaController');

/* Produtos */
router.get('/produtos', prodController.getProd);

router.post('/produtos', prodController.criarProduto);

router.put('/produtos/:id', prodController.editarProduto);

router.delete('/produtos/:id', prodController.deletarProduto);

/* Categorias */
router.get('/categorias', categoriaController.listarCategorias);

router.post('/categorias', categoriaController.criarCategoria);

router.delete('/categorias/:id', categoriaController.deletarCategoria);

/* Vendas */
router.get('/vendas', vendaController.listarVendas);

router.post('/vendas', vendaController.registrarVenda);

module.exports = router;