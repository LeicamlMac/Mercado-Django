from django.db import models
from django.utils import timezone


class Category(models.Model):
    name = models.CharField("nome", max_length=80, unique=True)
    is_active = models.BooleanField("ativo", default=True)
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "categoria"
        verbose_name_plural = "categorias"
        indexes = [
            models.Index(fields=["is_active"], name="category_is_active_idx"),
        ]

    def __str__(self):
        return self.name


class Department(models.Model):
    name = models.CharField("setor", max_length=80, unique=True)
    is_active = models.BooleanField("ativo", default=True)
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "setor"
        verbose_name_plural = "setores"
        indexes = [
            models.Index(fields=["is_active"], name="department_is_active_idx"),
        ]

    def __str__(self):
        return self.name


class ProductBase(models.Model):
    category = models.ForeignKey(
        Category,
        verbose_name="categoria",
        on_delete=models.CASCADE,
        related_name="products",
    )
    name = models.CharField("produto", max_length=120)
    brand = models.CharField("marca", max_length=120)
    departments = models.ManyToManyField(
        Department, verbose_name="setores", related_name="products", blank=True
    )
    is_active = models.BooleanField("ativo", default=True)
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        ordering = ["name", "brand"]
        verbose_name = "produto base"
        verbose_name_plural = "produtos base"
        constraints = [
            models.UniqueConstraint(
                fields=["category", "name", "brand"], name="unique_base_product"
            )
        ]
        indexes = [
            models.Index(fields=["name"], name="product_base_name_idx"),
            models.Index(fields=["brand"], name="product_base_brand_idx"),
            models.Index(fields=["is_active"], name="product_base_active_idx"),
        ]

    def __str__(self):
        return f"{self.name} - {self.brand}"


class ProductVariant(models.Model):
    product = models.ForeignKey(
        ProductBase,
        verbose_name="produto base",
        on_delete=models.CASCADE,
        related_name="variants",
    )
    variant_label = models.CharField("tipo", max_length=80, blank=True)
    package_size = models.CharField("tamanho", max_length=30)
    price = models.DecimalField("preco", max_digits=10, decimal_places=2)
    stock = models.PositiveIntegerField("estoque (unidades)", default=0)
    is_active = models.BooleanField("ativo", default=True)
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        verbose_name = "item de estoque"
        verbose_name_plural = "itens de estoque"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "variant_label", "package_size"],
                name="unique_product_variant_size",
            )
        ]
        indexes = [
            models.Index(fields=["is_active"], name="variant_is_active_idx"),
            models.Index(fields=["stock"], name="variant_stock_idx"),
            models.Index(fields=["updated_at"], name="variant_updated_at_idx"),
            models.Index(fields=["product", "is_active"], name="variant_product_active_idx"),
            models.Index(fields=["is_active", "updated_at"], name="variant_active_updated_idx"),
            models.Index(fields=["is_active", "stock"], name="variant_active_stock_idx"),
        ]

    def __str__(self):
        variant = self.variant_label or "Padrao"
        return f"{self.product} - {variant} - {self.package_size}"


class ProductPackage(models.Model):
    variant = models.ForeignKey(
        ProductVariant,
        verbose_name="item",
        on_delete=models.CASCADE,
        related_name="packages",
    )
    name = models.CharField("embalagem", max_length=40)
    units_per_package = models.PositiveIntegerField("unidades por embalagem", default=1)
    is_active = models.BooleanField("ativo", default=True)
    is_default = models.BooleanField("padrao", default=False)
    created_at = models.DateTimeField("criado em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizado em", auto_now=True)

    class Meta:
        ordering = ["units_per_package", "name"]
        verbose_name = "embalagem do item"
        verbose_name_plural = "embalagens dos itens"
        constraints = [
            models.UniqueConstraint(
                fields=["variant", "name"], name="unique_variant_package_name"
            )
        ]
        indexes = [
            models.Index(fields=["variant", "is_active"], name="package_variant_active_idx"),
        ]

    def __str__(self):
        return f"{self.variant} - {self.name} ({self.units_per_package} un)"


class StockMovement(models.Model):
    MOVEMENT_RECEIVE = "RECEIVE"
    MOVEMENT_SELL = "SELL"
    MOVEMENT_ADJUST = "ADJUST"
    MOVEMENT_LOSS = "LOSS"
    MOVEMENT_RETURN = "RETURN"
    MOVEMENT_TYPES = [
        (MOVEMENT_RECEIVE, "Recebimento"),
        (MOVEMENT_SELL, "Venda"),
        (MOVEMENT_ADJUST, "Ajuste"),
        (MOVEMENT_LOSS, "Perda"),
        (MOVEMENT_RETURN, "Devolucao"),
    ]

    variant = models.ForeignKey(
        ProductVariant,
        verbose_name="item",
        on_delete=models.CASCADE,
        related_name="movements",
    )
    movement_type = models.CharField("tipo de movimentacao", max_length=12, choices=MOVEMENT_TYPES)
    package = models.ForeignKey(
        ProductPackage,
        verbose_name="embalagem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movements",
    )
    package_quantity = models.PositiveIntegerField("quantidade de embalagens", default=1)
    units_delta = models.IntegerField("variacao em unidades")
    notes = models.CharField("observacao", max_length=255, blank=True)
    created_by = models.ForeignKey(
        "auth.User",
        verbose_name="usuario",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField("criado em", default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "movimentacao de estoque"
        verbose_name_plural = "movimentacoes de estoque"
        indexes = [
            models.Index(fields=["created_at"], name="movement_created_at_idx"),
            models.Index(fields=["variant", "created_at"], name="movement_variant_created_idx"),
            models.Index(fields=["movement_type", "created_at"], name="movement_type_created_idx"),
            models.Index(fields=["created_at", "id"], name="movement_created_id_idx"),
            models.Index(fields=["variant", "movement_type", "created_at"], name="movement_var_type_created_idx"),
        ]

    def __str__(self):
        return f"{self.variant} {self.movement_type} {self.units_delta:+d}"

class Expense(models.Model):
    EXPENSE_TYPES = [
        ('FIXA', 'Fixa'),
        ('VARIAVEL', 'Variável'),
    ]

    description = models.CharField("descrição", max_length=255)
    amount = models.DecimalField("valor", max_digits=10, decimal_places=2)
    expense_type = models.CharField("tipo", max_length=10, choices=EXPENSE_TYPES)
    date = models.DateField("data", default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "despesa"
        verbose_name_plural = "despesas"
        ordering = ['-date']

    def __str__(self):
        return f"{self.description} - R$ {self.amount}"