import logging
from copy import copy
from datetime import datetime as py_datetime
from django.core.cache import caches
import datetime as base_datetime
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F
from core.utils import CachedManager, uuidv7
from .openimis_model import OpenIMISHistoryMixin
from simple_history.utils import bulk_update_with_history, bulk_create_with_history

from ..fields import DateTimeField

logger = logging.getLogger(__name__)

cache = caches["default"]


class HistoryModelManager(CachedManager):
    """
    Custom manager that allows querying HistoryModel by uuid
    and includes caching logic for better performance.
    """

    def get_queryset(self):
        return super().get_queryset().annotate(uuid=F("id"))

    def filter(self, *args, **kwargs):
        # Check if 'uuid' is in kwargs, and if so, rename it to 'id'
        if "uuid" in kwargs:
            kwargs["id"] = kwargs.pop("uuid")
        # Call the parent class's filter method with the modified kwargs
        return super().filter(*args, **kwargs)

    def get(self, *args, **kwargs):
        # Check if 'uuid' is in kwargs, and if so, rename it to 'id'
        if "uuid" in kwargs:
            kwargs["id"] = kwargs.pop("uuid")
        # Call the parent class's filter method with the modified kwargs
        return super().get(*args, **kwargs)


class HistoryModel(OpenIMISHistoryMixin):
    id = models.UUIDField(
        primary_key=True, db_column="UUID", default=None, editable=False
    )
    objects = HistoryModelManager()
    is_deleted = models.BooleanField(db_column="isDeleted", default=False)
    json_ext = models.JSONField(db_column="Json_ext", blank=True, null=True)
    date_created = DateTimeField(
        db_column="DateCreated", null=True, default=py_datetime.now
    )
    date_updated = DateTimeField(
        db_column="DateUpdated", null=True, default=py_datetime.now
    )
    user_created = models.ForeignKey(
        "core.User",
        db_column="UserCreatedUUID",
        related_name="%(class)s_user_created",
        on_delete=models.deletion.DO_NOTHING,
        null=False,
    )
    user_updated = models.ForeignKey(
        "core.User",
        db_column="UserUpdatedUUID",
        related_name="%(class)s_user_updated",
        on_delete=models.deletion.DO_NOTHING,
        null=False,
    )
    version = models.IntegerField(default=1)

    @property
    def uuid(self):
        return self.id

    @uuid.setter
    def uuid(self, v):
        self.id = v

    @property
    def active(self):
        return not self.is_deleted

    @active.setter
    def active(self, value):
        self.is_deleted = not value

    def set_pk(self):
        self.pk = uuidv7()

    @classmethod
    def filter_queryset(cls, queryset=None):
        if queryset is None:
            queryset = cls.objects.filter(is_deleted=False)
        queryset = queryset.filter(is_deleted=False)
        return queryset

    @classmethod
    def bulk_save(cls, data_list, user, batch_size=100):
        """
        Efficiently update or create multiple instances based on 'id' field.
        All operations are atomic - either all succeed or all fail.

        Args:
            data_list: List of dicts with instance data (with or without 'id')
            user: User performing the operation
            batch_size: Number of records to process per batch

        Returns:
            dict with 'created' and 'updated' counts
        """
        if not data_list:
            return {'created': 0, 'updated': 0}

        now = py_datetime.now()

        ids_to_update = [d['id'] for d in data_list if d.get('id')]

        existing = {obj.id: obj for obj in cls.objects.filter(id__in=ids_to_update, is_deleted=False)}

        to_create = []
        to_update = []

        exclude_fields = {
            'id', 'uuid', 'date_created', 'user_created', 'date_updated',
            'user_updated', 'version', 'is_deleted', 'date_valid_from',
            'date_valid_to', 'replacement_uuid'
        }

        for data in data_list:
            record_id = data.get('id')

            if record_id and record_id in existing:
                instance = existing[record_id]
                for field, value in data.items():
                    if field not in exclude_fields:
                        setattr(instance, field, value)
                instance.user_updated = user
                instance.date_updated = now
                instance.version = instance.version + 1
                to_update.append(instance)
            else:
                create_data = {k: v for k, v in data.items() if k not in exclude_fields}
                instance = cls(**create_data)
                instance.set_pk()
                instance.user_created = user
                instance.user_updated = user
                instance.date_created = now
                instance.date_updated = now
                instance.version = 1
                to_create.append(instance)

        with transaction.atomic():
            created_count = 0
            updated_count = 0

            if to_create:
                created = bulk_create_with_history(to_create, cls, batch_size=batch_size, default_user=user)
                cls.bulk_update_cache(created)
                created_count = len(created)

            if to_update:
                update_fields = [
                    f for f in to_update[0].__dict__.keys()
                    if not f.startswith('_') and f not in exclude_fields
                ]
                update_fields += ['user_updated', 'date_updated', 'version']
                updated_count = bulk_update_with_history(to_update, cls, update_fields, batch_size=batch_size, default_user=user)
                cls.bulk_update_cache(to_update)

        return {'created': created_count, 'updated': updated_count}

    class Meta:
        abstract = True


class HistoryBusinessModel(HistoryModel):
    date_valid_from = DateTimeField(db_column="DateValidFrom", default=py_datetime.now)
    date_valid_to = DateTimeField(db_column="DateValidTo", blank=True, null=True)
    replacement_uuid = models.UUIDField(
        db_column="ReplacementUUID", blank=True, null=True
    )

    def replace_object(self, data, **kwargs):
        from .user import User
        # check if object was created and saved in database (having date_created field)
        if self.id is None:
            return None
        user = User.objects.get(**kwargs)
        # 1 step - create new entity
        new_entity = self._create_new_entity(user=user, data=data)
        # 2 step - update the fields for the entity to be replaced
        self._update_replaced_entity(
            user=user,
            uuid_from_new_entity=new_entity.id,
            date_valid_from_new_entity=new_entity.date_valid_from,
        )

    def _create_new_entity(self, user, data):
        """1 step - create new entity"""
        now = py_datetime.now()
        new_entity = copy(self)
        new_entity.id = None
        new_entity.version = 1
        new_entity.date_valid_from = now
        new_entity.date_valid_to = None
        new_entity.replacement_uuid = None
        # replace the fiedls if there are any to update in new entity
        if "uuid" in data:
            data.pop("uuid")
        if len(data) > 0:
            [setattr(new_entity, key, data[key]) for key in data]
        if self.date_valid_from is None:
            raise ValidationError("Field date_valid_from should not be empty")
        new_entity.save(user=user)
        return new_entity

    def _update_replaced_entity(
        self, user, uuid_from_new_entity, date_valid_from_new_entity
    ):
        """2 step - update the fields for the entity to be replaced"""
        # convert to datetime if the date_valid_from from new entity is date
        if not isinstance(date_valid_from_new_entity, base_datetime.datetime):
            date_valid_from_new_entity = base_datetime.combine(
                date_valid_from_new_entity, base_datetime.min.time()
            )
        if not self.is_dirty(check_relationship=True):
            if self.date_valid_to is not None:
                if date_valid_from_new_entity < self.date_valid_to:
                    self.date_valid_to = date_valid_from_new_entity
            else:
                self.date_valid_to = date_valid_from_new_entity
            self.replacement_uuid = uuid_from_new_entity
            self.save(user=user)
            return self
        else:
            raise ValidationError(
                "Object is changed - it must be updated before being replaced"
            )

    class Meta:
        abstract = True
