import uuid
from datetime import datetime as py_datetime
from dirtyfields import DirtyFieldsMixin
from django.core.exceptions import ValidationError
from django.db.models import (
    Q, UUIDField, DateTimeField, BooleanField, Model, IntegerField, ForeignKey,
    BigAutoField, JSONField, deletion,
)
from simple_history.models import HistoricalRecords

from core.utils import CachedManager, CachedModelMixin, filter_validity as core_filter_validity
from django.apps import apps


class OpenIMISModel(DirtyFieldsMixin, CachedModelMixin, Model):
    def filter_validity(arg="validity", prefix="", **kwargs):
        validity = kwargs.get(arg, None)
        if not validity:
            return Q(active=True)
        else:
            return Q(active=False) | Q(date_deactivated__gte=validity)

    objects = CachedManager()
    id = BigAutoField(
        primary_key=True, auto_created=True, editable=False
    )
    uuid = UUIDField(
        unique=True, db_column="UUID", default=uuid.uuid4, editable=False
    )
    active = BooleanField(default=True)

    json_ext = JSONField(db_column="Json_ext", blank=True, null=True)
    date_deactivated = DateTimeField(null=True, default=None)
    date_created = DateTimeField(null=True, default=py_datetime.now)
    date_updated = DateTimeField(null=True, default=py_datetime.now)
    user_created = ForeignKey(
        "core.User",
        related_name="%(class)s_user_created",
        on_delete=deletion.DO_NOTHING,
        null=True,
    )
    user_updated = ForeignKey(
        "core.User",
        related_name="%(class)s_user_updated",
        on_delete=deletion.DO_NOTHING,
        null=True,
    )
    version = IntegerField(default=1)
    history = HistoricalRecords(
        inherit=True,
    )

    def set_uuid(self):
        self.uuid = uuid.uuid4()

    def save_history(self):
        pass

    def update(self, *args, user=None, username=None, save=True, **kwargs):
        """
        Overrides the default update to update the cache after saving the instance.
        """
        obj_data = kwargs.pop("data", {})
        if not obj_data:
            obj_data = kwargs
            kwargs = {}
        [setattr(self, key, obj_data[key]) for key in obj_data]
        if save:
            self.save(*args, user=user, username=user, **kwargs)
        return self

    def save(self, *args, user=None, username=None, **kwargs):
        # get the user data so as to assign later his uuid id in fields user_updated etc
        user = self.get_user(user=None, username=None)
        now = py_datetime.now()
        # check if object has been newly created
        if self.id is None:
            # save the new object
            self.user_created = user
            self.date_created = now
            self.date_updated = now
            self.user_updated = user
            result = super().save(*args, **kwargs)
            self.update_cache()
            return result
        if self.is_dirty(check_relationship=True):
            if not self.user_created:
                # past = self.objects.filter(pk=self.id).first()
                # if not past:
                self.user_created = user
                self.date_created = now
                # TODO this could erase a instance, version check might be too light
                # elif not self.version == past.version:
                #     raise ValidationError(
                #         "Record has not be updated - the version don't match with existing record"
                #     )
            self.date_updated = now
            self.user_updated = user
            self.version = self.version + 1
            # check if we have business model
            if hasattr(self, "replacement_uuid"):
                if (
                    self.replacement_uuid is not None
                    and "replacement_uuid" not in self.get_dirty_fields()
                ):
                    raise ValidationError(
                        "Update error! You cannot update replaced entity"
                    )
            result = super().save(*args, **kwargs)
            self.update_cache()
            return result
        else:
            raise ValidationError(
                "Record has not be updated - there are no changes in fields"
            )

    def delete_history(self):
        pass

    def get_user(self, user=None, username=None):
        if not user:
            user_id = 1
            if username:
                user = apps.get_model('core', 'User').objects.get(username=username)
            elif self.__class__.__name__ != 'InteractiveUser' and getattr(self, 'audit_user_id', None):
                user_id = getattr(self, 'audit_user_id', None)
                if user_id == -1:
                    user_id = 1

            user = apps.get_model('core', 'User').objects.get(i_user_id=user_id)
        return user

    def delete(self, *args, user=None, username=None, **kwargs):
        user = self.get_user(user=None, username=None)
        if not self.is_dirty(check_relationship=True) and self.active:
            now = py_datetime.now()
            self.date_updated = now
            self.user_updated = user
            self.version = self.version + 1
            self.active = False
            # check if we have business model
            if hasattr(self, "replacement_uuid"):
                # When a replacement entity is deleted, the link should be removed
                # from replaced entity so a new replacement could be generated
                replaced_entity = self.__class__.objects.filter(
                    replacement_uuid=self.id
                ).first()
                if replaced_entity:
                    replaced_entity.replacement_uuid = None
                    replaced_entity.save(user=user)
            result = super(OpenIMISModel, self).save(*args, **kwargs)
            return result
        else:
            raise ValidationError(
                "Record has not be deactivated, the object is different and must be updated before deactivating"
            )

    def copy(self, exclude_fields=["id", "uuid"]):
        """
        Creates a copy of a Django model instance, excluding specified fields (default: 'id' and 'uuid').
        Args:
            exclude_fields: List of field names to exclude from copying (default: ['id', 'uuid'])
        Returns:
            A new unsaved instance with copied attributes
        """
        model_class = self.__class__
        new_instance = model_class()
        fields = self._meta.get_fields()
        for field in fields:
            if field.name not in exclude_fields and hasattr(self, field.name):
                if field.is_relation:
                    if field.many_to_one or field.one_to_one:
                        setattr(new_instance, field.name, getattr(self, field.name))
                    elif field.one_to_many or field.many_to_many:
                        continue
                else:
                    setattr(new_instance, field.name, getattr(self, field.name))

        return new_instance

    @classmethod
    def filter_queryset(cls, queryset=None):
        if queryset is None:
            queryset = cls.objects.all()
        queryset = queryset.filter()
        return queryset

    class Meta:
        abstract = True


class OpenIMISMigrationModel(OpenIMISModel):
    ####
    # How to use:
    # for migration of Versionned Model to openIMIS Model
    # will keep the id as is but will rename the table column to id
    # 1. change the base model of the class you want to use by OpenIMISMigrationModel and comment id and uuid
    # 2. run `python manage.py makemigrations app_name` to update the table changes : rename and new column,
    #    it will also create the history tablesrun `python manage.py makemigrations app_name --name to_history --empty`
    # 3.
    # 4. in that migration file, run MyModel.migrate_to_history() to move all the
    #    record that have validitiy_to not null to history model
    # 5. change the base model of the class you want to use by OpenIMISModel
    # 6. run `python manage.py makemigrations app_name` to update the table changes : remove the validity_to and from
    ####
    validity_from = DateTimeField(db_column="ValidityFrom", default=py_datetime.now, null=True)
    validity_to = DateTimeField(db_column="ValidityTo", blank=True, null=True, default=None)

    def filter_validity(arg="validity", prefix="", **kwargs):
        return core_filter_validity(arg, prefix, **kwargs)

    class Meta:
        abstract = True
