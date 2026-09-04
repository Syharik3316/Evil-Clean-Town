from app.models.user import OrganizationLegalType


def validate_inn(inn: str) -> OrganizationLegalType:
    """Проверяет контрольную сумму ИНН РФ. Возвращает тип организации или бросает ValueError."""
    if not inn.isdigit():
        raise ValueError("ИНН должен состоять только из цифр")

    digits = [int(c) for c in inn]

    if len(inn) == 10:
        coefficients = [2, 4, 10, 3, 5, 9, 4, 6, 8]
        checksum = sum(c * d for c, d in zip(coefficients, digits)) % 11 % 10
        if checksum != digits[9]:
            raise ValueError("Некорректная контрольная сумма ИНН")
        return OrganizationLegalType.legal_entity

    if len(inn) == 12:
        coeffs1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
        check1 = sum(c * d for c, d in zip(coeffs1, digits)) % 11 % 10
        coeffs2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
        check2 = sum(c * d for c, d in zip(coeffs2, digits)) % 11 % 10
        if check1 != digits[10] or check2 != digits[11]:
            raise ValueError("Некорректная контрольная сумма ИНН")
        return OrganizationLegalType.individual_entrepreneur

    raise ValueError("ИНН должен содержать 10 (юрлицо) или 12 (ИП) цифр")
